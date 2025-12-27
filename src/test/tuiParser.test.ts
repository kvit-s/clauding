import * as assert from 'assert';
import { TUIParser, parseToMarkdown, parseToJSON, parseTUISession, parseTUISessionToBoth } from '../utils/tuiParser';

suite('TUI Parser Test Suite', () => {
	let parser: TUIParser;

	setup(() => {
		parser = new TUIParser();
	});

	suite('ANSI Escape Code Stripping', () => {
		test('should remove color codes', () => {
			const input = '\x1B[38;2;255;255;255mHello\x1B[39m World';
			const events = parser.parse(input);
			// The parser should strip ANSI codes internally
			assert.ok(events !== null);
		});

		test('should remove cursor control sequences', () => {
			const input = '\x1B[2K\x1B[1AText';
			const events = parser.parse(input);
			assert.ok(events !== null);
		});
	});

	suite('User Input Parsing', () => {
		test('should parse single-line user input', () => {
			const input = `Script started on 2025-10-28 22:19:35-05:00 [COMMAND="test" TERM="xterm-256color"]
\x1B[48;2;55;55;55m\x1B[38;2;255;255;255m> Read the file and process it\x1B[39m\x1B[49m
`;
			const events = parser.parse(input);

			assert.strictEqual(events.length, 1);
			assert.strictEqual(events[0].type, 'user_input');
			assert.strictEqual(events[0].content, 'Read the file and process it');
			assert.strictEqual(events[0].timestamp, '2025-10-28 22:19:35-05:00');
		});

		test('should parse multi-line user input', () => {
			const input = `Script started on 2025-10-28 22:19:35-05:00 [COMMAND="test"]
\x1B[48;2;55;55;55m\x1B[38;2;255;255;255m> Read .clauding/features/test/prompt.md and create a concise implementation plan\x1B[39m\x1B[49m
\x1B[48;2;55;55;55m\x1B[38;2;255;255;255mfocused on key steps. Save the plan to plan.md\x1B[39m\x1B[49m
`;
			const events = parser.parse(input);

			assert.strictEqual(events.length, 1);
			assert.strictEqual(events[0].type, 'user_input');
			assert.ok(events[0].content.includes('Read .clauding/features/test/prompt.md'));
			assert.ok(events[0].content.includes('Save the plan to plan.md'));
		});

		test('should filter out placeholder prompts with "edit"', () => {
			const input = `Script started on 2025-10-28 22:19:35-05:00 [COMMAND="test"]
> Try "edit <filepath> to..."
`;
			const events = parser.parse(input);

			assert.strictEqual(events.length, 0);
		});

		test('should filter out all placeholder prompts starting with Try', () => {
			const input = `Script started on 2025-10-28 22:19:35-05:00 [COMMAND="test"]
\x1B[38;2;153;153;153m> \x1B[39m\x1B[2mTry "write a test for ClaudingSidebarProvider.ts"\x1B[22m
`;
			const events = parser.parse(input);

			assert.strictEqual(events.length, 0);
		});

		test('should accept real user input that does not start with Try', () => {
			const input = `Script started on 2025-10-28 22:19:35-05:00 [COMMAND="test"]
\x1B[48;2;55;55;55m\x1B[38;2;255;255;255m> Read the file and implement the feature\x1B[39m\x1B[49m
`;
			const events = parser.parse(input);

			assert.strictEqual(events.length, 1);
			assert.strictEqual(events[0].type, 'user_input');
			assert.strictEqual(events[0].content, 'Read the file and implement the feature');
		});
	});

	suite('System Response Parsing', () => {
		test('should parse single-line response', () => {
			const input = `Script started on 2025-10-28 22:19:35-05:00 [COMMAND="test"]
\x1B[38;2;255;255;255m●\x1B[39m I'll read the prompt file and create a plan.
`;
			const events = parser.parse(input);

			assert.strictEqual(events.length, 1);
			assert.strictEqual(events[0].type, 'system_response');
			assert.strictEqual(events[0].content, "I'll read the prompt file and create a plan.");
		});

		test('should parse multi-line response with bullet points', () => {
			const input = `Script started on 2025-10-28 22:19:35-05:00 [COMMAND="test"]
\x1B[38;2;255;255;255m●\x1B[39m Done! I've created the implementation plan.
  The plan identifies:
  - Root cause: The selectedFeatureName is not set
  - Simple fix: Add one line in the provider
  - Expected outcome: Features will be activated
`;
			const events = parser.parse(input);

			assert.strictEqual(events.length, 1);
			assert.strictEqual(events[0].type, 'system_response');
			assert.ok(events[0].content.includes('Done! I\'ve created the implementation plan.'));
			assert.ok(events[0].content.includes('- Root cause:'));
			assert.ok(events[0].content.includes('- Simple fix:'));
			assert.ok(events[0].content.includes('- Expected outcome:'));
		});

		test('should handle multiple responses in sequence', () => {
			const input = `Script started on 2025-10-28 22:19:35-05:00 [COMMAND="test"]
\x1B[38;2;255;255;255m●\x1B[39m First response here.
\x1B[2K\x1B[1A
\x1B[38;2;255;255;255m●\x1B[39m Second response here.
\x1B[2K\x1B[1A
\x1B[38;2;255;255;255m●\x1B[39m Third response here.
`;
			const events = parser.parse(input);

			assert.strictEqual(events.length, 3);
			assert.strictEqual(events[0].content, 'First response here.');
			assert.strictEqual(events[1].content, 'Second response here.');
			assert.strictEqual(events[2].content, 'Third response here.');
		});

		test('should stop collecting at frame boundaries', () => {
			const input = `Script started on 2025-10-28 22:19:35-05:00 [COMMAND="test"]
\x1B[38;2;255;255;255m●\x1B[39m Response with continuation.
  This is continuation line 1.
  This is continuation line 2.
\x1B[38;2;215;119;87m✻\x1B[39m Seasoning…
`;
			const events = parser.parse(input);

			assert.strictEqual(events.length, 1);
			assert.ok(events[0].content.includes('Response with continuation.'));
			assert.ok(events[0].content.includes('continuation line 1'));
			assert.ok(events[0].content.includes('continuation line 2'));
			assert.ok(!events[0].content.includes('Seasoning'));
		});
	});

	suite('Mixed User Input and System Response', () => {
		test('should parse conversation with both user and system', () => {
			const input = `Script started on 2025-10-28 22:19:35-05:00 [COMMAND="test"]
\x1B[48;2;55;55;55m\x1B[38;2;255;255;255m> Create a simple test file\x1B[39m\x1B[49m
\x1B[2K\x1B[1A
\x1B[38;2;255;255;255m●\x1B[39m I'll create the test file for you.
\x1B[2K\x1B[1A
\x1B[38;2;255;255;255m●\x1B[39m Write(test.js)
`;
			const events = parser.parse(input);

			assert.strictEqual(events.length, 3);
			assert.strictEqual(events[0].type, 'user_input');
			assert.strictEqual(events[0].content, 'Create a simple test file');
			assert.strictEqual(events[1].type, 'system_response');
			assert.strictEqual(events[1].content, "I'll create the test file for you.");
			assert.strictEqual(events[2].type, 'system_response');
			assert.strictEqual(events[2].content, 'Write(test.js)');
		});
	});

	suite('Duplicate Filtering', () => {
		test('should filter out duplicate consecutive events', () => {
			const input = `Script started on 2025-10-28 22:19:35-05:00 [COMMAND="test"]
\x1B[38;2;255;255;255m●\x1B[39m Same response.
\x1B[2K\x1B[1A
\x1B[38;2;255;255;255m●\x1B[39m Same response.
\x1B[2K\x1B[1A
\x1B[38;2;255;255;255m●\x1B[39m Different response.
`;
			const events = parser.parse(input);

			assert.strictEqual(events.length, 2);
			assert.strictEqual(events[0].content, 'Same response.');
			assert.strictEqual(events[1].content, 'Different response.');
		});
	});

	suite('Session Timestamp Extraction', () => {
		test('should extract session start timestamp', () => {
			const input = 'Script started on 2025-10-28 22:19:35-05:00 [COMMAND="test"]\n\x1B[38;2;255;255;255m●\x1B[39m Hello world this is a test';
			const events = parser.parse(input);

			assert.strictEqual(events.length, 1);
			assert.strictEqual(events[0].timestamp, '2025-10-28 22:19:35-05:00');
		});

		test('should handle missing timestamp', () => {
			const input = '\x1B[38;2;255;255;255m●\x1B[39m Hello world this is a test';
			const events = parser.parse(input);

			assert.strictEqual(events.length, 1);
			assert.strictEqual(events[0].timestamp, undefined);
		});
	});

	suite('Markdown Output', () => {
		test('should generate markdown with user input', () => {
			const input = `Script started on 2025-10-28 22:19:35-05:00 [COMMAND="test"]
\x1B[48;2;55;55;55m\x1B[38;2;255;255;255m> Test input\x1B[39m\x1B[49m
`;
			const events = parser.parse(input);
			const markdown = parser.toMarkdown(events);

			assert.ok(markdown.includes('# TUI Session Log'));
			assert.ok(markdown.includes('**Session started:** 2025-10-28 22:19:35-05:00'));
			assert.ok(markdown.includes('## User Input'));
			assert.ok(markdown.includes('Test input'));
		});

		test('should generate markdown with system response', () => {
			const input = `Script started on 2025-10-28 22:19:35-05:00 [COMMAND="test"]
\x1B[38;2;255;255;255m●\x1B[39m System response here.
`;
			const events = parser.parse(input);
			const markdown = parser.toMarkdown(events);

			assert.ok(markdown.includes('## System Response'));
			assert.ok(markdown.includes('System response here.'));
		});

		test('should preserve bullet points in markdown', () => {
			const input = `Script started on 2025-10-28 22:19:35-05:00 [COMMAND="test"]
\x1B[38;2;255;255;255m●\x1B[39m Response with list:
  - Item 1
  - Item 2
`;
			const events = parser.parse(input);
			const markdown = parser.toMarkdown(events);

			assert.ok(markdown.includes('- Item 1'));
			assert.ok(markdown.includes('- Item 2'));
		});
	});

	suite('JSON Output', () => {
		test('should generate valid JSON', () => {
			const input = `Script started on 2025-10-28 22:19:35-05:00 [COMMAND="test"]
\x1B[38;2;255;255;255m●\x1B[39m Test response.
`;
			const events = parser.parse(input);
			const json = parser.toJSON(events);

			const parsed = JSON.parse(json);
			assert.strictEqual(Array.isArray(parsed), true);
			assert.strictEqual(parsed.length, 1);
			assert.strictEqual(parsed[0].type, 'system_response');
			assert.strictEqual(parsed[0].content, 'Test response.');
		});

		test('should include all event fields in JSON', () => {
			const input = `Script started on 2025-10-28 22:19:35-05:00 [COMMAND="test"]
\x1B[48;2;55;55;55m\x1B[38;2;255;255;255m> User query\x1B[39m\x1B[49m
`;
			const events = parser.parse(input);
			const json = parser.toJSON(events);

			const parsed = JSON.parse(json);
			assert.ok(parsed[0].timestamp);
			assert.ok(parsed[0].type);
			assert.ok(parsed[0].content);
		});
	});

	suite('Exported Helper Functions', () => {
		test('parseToMarkdown should work standalone', () => {
			const input = `Script started on 2025-10-28 22:19:35-05:00 [COMMAND="test"]
\x1B[38;2;255;255;255m●\x1B[39m Test response.
`;
			const markdown = parseToMarkdown(input);

			assert.ok(markdown.includes('# TUI Session Log'));
			assert.ok(markdown.includes('Test response.'));
		});

		test('parseToJSON should work standalone', () => {
			const input = `Script started on 2025-10-28 22:19:35-05:00 [COMMAND="test"]
\x1B[38;2;255;255;255m●\x1B[39m Test response.
`;
			const json = parseToJSON(input);
			const parsed = JSON.parse(json);

			assert.strictEqual(parsed.length, 1);
			assert.strictEqual(parsed[0].content, 'Test response.');
		});

		test('parseTUISession should return events array', () => {
			const input = `Script started on 2025-10-28 22:19:35-05:00 [COMMAND="test"]
\x1B[38;2;255;255;255m●\x1B[39m Test response.
`;
			const events = parseTUISession(input);

			assert.strictEqual(Array.isArray(events), true);
			assert.strictEqual(events.length, 1);
			assert.strictEqual(events[0].content, 'Test response.');
		});

		test('parseTUISessionToBoth should parse only once', () => {
			const input = `Script started on 2025-10-28 22:19:35-05:00 [COMMAND="test"]
\x1B[38;2;255;255;255m●\x1B[39m Test response.
`;
			const result = parseTUISessionToBoth(input);

			assert.ok(result.markdown);
			assert.ok(result.json);

			// Verify both outputs are correct
			assert.ok(result.markdown.includes('Test response.'));
			const parsed = JSON.parse(result.json);
			assert.strictEqual(parsed[0].content, 'Test response.');
		});
	});

	suite('Edge Cases', () => {
		test('should handle empty input', () => {
			const events = parser.parse('');
			assert.strictEqual(events.length, 0);
		});

		test('should handle input with only whitespace', () => {
			const events = parser.parse('   \n\n   ');
			assert.strictEqual(events.length, 0);
		});

		test('should handle input with no matching patterns', () => {
			const events = parser.parse('Random text without any markers');
			assert.strictEqual(events.length, 0);
		});

		test('should filter out very short responses', () => {
			const input = `Script started on 2025-10-28 22:19:35-05:00 [COMMAND="test"]
\x1B[38;2;255;255;255m●\x1B[39m OK
`;
			const events = parser.parse(input);
			// Response should be filtered because it's too short (< 10 chars)
			assert.strictEqual(events.length, 0);
		});

		test('should handle responses with special characters', () => {
			const input = `Script started on 2025-10-28 22:19:35-05:00 [COMMAND="test"]
\x1B[38;2;255;255;255m●\x1B[39m Response with "quotes" and 'apostrophes' & symbols: $100 + 50% = $150.
`;
			const events = parser.parse(input);

			assert.strictEqual(events.length, 1);
			assert.ok(events[0].content.includes('"quotes"'));
			assert.ok(events[0].content.includes("'apostrophes'"));
			assert.ok(events[0].content.includes('$100'));
		});

		test('should handle continuation lines with numbers', () => {
			const input = `Script started on 2025-10-28 22:19:35-05:00 [COMMAND="test"]
\x1B[38;2;255;255;255m●\x1B[39m Response with list:
  1. First item
  2. Second item
  3. Third item
`;
			const events = parser.parse(input);

			assert.strictEqual(events.length, 1);
			assert.ok(events[0].content.includes('1. First item'));
			assert.ok(events[0].content.includes('2. Second item'));
			assert.ok(events[0].content.includes('3. Third item'));
		});

		test('should stop at multiple consecutive empty lines', () => {
			const input = `Script started on 2025-10-28 22:19:35-05:00 [COMMAND="test"]
\x1B[38;2;255;255;255m●\x1B[39m Response here.
  Continuation line.




  This should not be included.
`;
			const events = parser.parse(input);

			assert.strictEqual(events.length, 1);
			assert.ok(events[0].content.includes('Continuation line'));
			// The parser allows up to 2 consecutive empty lines, so we need 3+ to stop
			assert.ok(!events[0].content.includes('This should not be included'));
		});
	});

	suite('Feedback Prompt Filtering', () => {
		test('should filter out cyan bullet feedback prompts', () => {
			const input = `Script started on 2025-10-31 03:31:41-05:00 [COMMAND="test"]
\x1B[38;2;255;255;255m●\x1B[39m Perfect! The merge has been completed successfully.
\x1B[36m●\x1B[39m How is Claude doing this session? (optional)
  \x1B[36m1\x1B[39m: Bad    \x1B[36m2\x1B[39m: Fine   \x1B[36m3\x1B[39m: Good
`;
			const events = parser.parse(input);

			// Should only capture the white bullet response, not the cyan feedback prompt
			assert.strictEqual(events.length, 1);
			assert.strictEqual(events[0].type, 'system_response');
			assert.strictEqual(events[0].content, 'Perfect! The merge has been completed successfully.');
		});

		test('should handle response followed by feedback prompt', () => {
			const input = `Script started on 2025-10-31 03:31:41-05:00 [COMMAND="test"]
\x1B[38;2;255;255;255m●\x1B[39m Task completed successfully.
  Summary of changes:
  - Fixed the bug
  - Added tests
\x1B[36m●\x1B[39m How is Claude doing this session? (optional)
`;
			const events = parser.parse(input);

			assert.strictEqual(events.length, 1);
			assert.strictEqual(events[0].type, 'system_response');
			assert.ok(events[0].content.includes('Task completed successfully'));
			assert.ok(events[0].content.includes('Summary of changes'));
			assert.ok(events[0].content.includes('- Fixed the bug'));
			assert.ok(!events[0].content.includes('How is Claude doing'));
		});
	});

	suite('Continuation Lines with ANSI Codes', () => {
		test('should handle continuation lines with bold ANSI codes', () => {
			const input = `Script started on 2025-10-31 03:31:41-05:00 [COMMAND="test"]
\x1B[38;2;255;255;255m●\x1B[39m Perfect! The merge has been completed successfully.

  \x1B[1mSummary\x1B[22m

  I've successfully resolved the merge conflict.

  \x1B[1mConflict Resolution:\x1B[22m
  The conflict was resolved by combining information from both branches.
`;
			const events = parser.parse(input);

			assert.strictEqual(events.length, 1);
			assert.strictEqual(events[0].type, 'system_response');
			assert.ok(events[0].content.includes('Perfect! The merge has been completed successfully'));
			assert.ok(events[0].content.includes('Summary'));
			assert.ok(events[0].content.includes('Conflict Resolution:'));
			assert.ok(events[0].content.includes('combining information'));
		});

		test('should handle continuation lines with color codes', () => {
			const input = `Script started on 2025-10-31 03:31:41-05:00 [COMMAND="test"]
\x1B[38;2;255;255;255m●\x1B[39m Changes merged successfully.

  \x1B[1mFeature Changes:\x1B[22m
  The feature in \x1B[38;2;177;185;249msrc/services/AgentService.ts:219\x1B[39m was updated.
  Branch \x1B[38;2;177;185;249mfeature/test\x1B[39m is now merged into \x1B[38;2;177;185;249mmain\x1B[39m.
`;
			const events = parser.parse(input);

			assert.strictEqual(events.length, 1);
			assert.ok(events[0].content.includes('Changes merged successfully'));
			assert.ok(events[0].content.includes('Feature Changes:'));
			assert.ok(events[0].content.includes('src/services/AgentService.ts:219'));
			assert.ok(events[0].content.includes('feature/test'));
			assert.ok(events[0].content.includes('main'));
		});

		test('should handle nested lists with varying indentation', () => {
			const input = `Script started on 2025-10-31 03:31:41-05:00 [COMMAND="test"]
\x1B[38;2;255;255;255m●\x1B[39m Perfect! The alignment is correct.

  \x1B[1mVertical Alignment Analysis\x1B[22m

  The CSS ensures proper alignment through this chain:

  1. \x1B[1m.feature-item\x1B[22m (line 63-72):
    - \x1B[38;2;177;185;249mdisplay: flex\x1B[39m
    - \x1B[38;2;177;185;249malign-items: center\x1B[39m ✓
    - \x1B[38;2;177;185;249mheight: 22px\x1B[39m
  2. \x1B[1m.feature-item-content\x1B[22m (line 92-101):
    - \x1B[38;2;177;185;249mdisplay: flex\x1B[39m
    - \x1B[38;2;177;185;249malign-items: center\x1B[39m ✓

  \x1B[1mSummary\x1B[22m

  Yes, the icons are now properly aligned!
`;
			const events = parser.parse(input);

			assert.strictEqual(events.length, 1);
			assert.ok(events[0].content.includes('Perfect! The alignment is correct'));
			assert.ok(events[0].content.includes('Vertical Alignment Analysis'));
			assert.ok(events[0].content.includes('1. .feature-item (line 63-72):'));
			assert.ok(events[0].content.includes('- display: flex'));
			assert.ok(events[0].content.includes('- align-items: center ✓'));
			assert.ok(events[0].content.includes('2. .feature-item-content (line 92-101):'));
			assert.ok(events[0].content.includes('Summary'));
			assert.ok(events[0].content.includes('Yes, the icons are now properly aligned'));
		});
	});

	suite('Real-world Scenario', () => {
		test('should parse a complete agent session', () => {
			const input = `Script started on 2025-10-28 22:19:35-05:00 [COMMAND="claude --dangerously-skip-permissions 'Create a plan'"]
\x1B[48;2;55;55;55m\x1B[38;2;255;255;255m> Read .clauding/features/test/prompt.md and create a concise implementation plan\x1B[39m\x1B[49m
\x1B[48;2;55;55;55m\x1B[38;2;255;255;255mfocused on key steps. Save the plan to plan.md\x1B[39m\x1B[49m
\x1B[2K\x1B[1A
\x1B[38;2;255;255;255m●\x1B[39m I'll read the prompt file and create a plan.
\x1B[2K\x1B[1A
\x1B[38;2;255;255;255m●\x1B[39m Read(.clauding/features/test/prompt.md)
\x1B[2K\x1B[1A
\x1B[38;2;255;255;255m●\x1B[39m Now I'll create the implementation plan.
\x1B[2K\x1B[1A
\x1B[38;2;255;255;255m●\x1B[39m Write(plan.md)
\x1B[2K\x1B[1A
\x1B[38;2;255;255;255m●\x1B[39m Done! I've created the plan.
  The plan includes:
  - Root cause analysis
  - Implementation steps
  - Testing strategy
`;
			const events = parser.parse(input);

			// Should have 1 user input + 5 system responses
			assert.strictEqual(events.length, 6);

			// Verify user input
			assert.strictEqual(events[0].type, 'user_input');
			assert.ok(events[0].content.includes('Read .clauding/features/test/prompt.md'));
			assert.ok(events[0].content.includes('Save the plan to plan.md'));

			// Verify system responses
			assert.strictEqual(events[1].type, 'system_response');
			assert.ok(events[1].content.includes("I'll read the prompt file"));

			assert.strictEqual(events[2].type, 'system_response');
			assert.strictEqual(events[2].content, 'Read(.clauding/features/test/prompt.md)');

			// Verify last response with bullet points
			assert.ok(events[5].content.includes('Done!'));
			assert.ok(events[5].content.includes('- Root cause analysis'));
			assert.ok(events[5].content.includes('- Implementation steps'));
			assert.ok(events[5].content.includes('- Testing strategy'));
		});
	});
});
