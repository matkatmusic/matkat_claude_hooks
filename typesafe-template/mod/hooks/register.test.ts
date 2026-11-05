import { test, expect } from 'claude-code/testing';

const QUESTIONS_TEXT = '{ "reportsBug": { "type": "noul", "instructions": "Does the reply report a bug?" } }';
const NOUL_ANSWERS = { reportsBug: { type: 'noul', noul: 0.5 } };
const TURN_ANSWER = { answer: 'found a crash', durationMs: 12, isAborted: false, turnId: 't1', reason: 'answer' } as const;

type StubOptions = { apiKey?: string; fetchStatus?: number; answers?: unknown; userDispatchText?: string; dispatchText?: string };

function setUpStubs(on: any, questionsText: string, stateText: string, options: StubOptions = {}) {
    const { fetchStatus = 200, answers = NOUL_ANSWERS, userDispatchText, dispatchText } = options;
    const apiKey = 'apiKey' in options ? options.apiKey : 'test-key';
    const fetchCalls: { url: string; init: any }[] = [];
    const toasts: string[] = [];
    const readPaths: string[] = [];
    const envNames: string[] = [];
    const existsPaths: string[] = [];
    const fileWrites: { path: string; text: string }[] = [];
    function readDispatcherText(path: string): string | undefined {
        if (path.endsWith('/dispatcher/user-dispatch.json'))
            return userDispatchText;
        if (path.endsWith('/dispatcher/dispatch.json'))
            return dispatchText;
        return undefined;
    }
    function readFileText(_$: any, e: any) {
        readPaths.push(e.path);
        if (e.path.endsWith('/hooks/questions.json'))
            return { value: questionsText };
        if (e.path.endsWith('/hooks/state.json'))
            return { value: stateText };
        const dispatcherText = readDispatcherText(e.path);
        if (dispatcherText !== undefined)
            return { value: dispatcherText };
        throw new Error(`unexpected read of ${e.path}`);
    }
    function getFileExists(_$: any, e: any) {
        existsPaths.push(e.path);
        return { value: readDispatcherText(e.path) !== undefined };
    }
    function appendFileWrite(_$: any, e: any) {
        fileWrites.push({ path: e.path, text: e.text });
        return { value: undefined };
    }
    function getEnvValue(_$: any, e: any) {
        envNames.push(e.name);
        if (e.name === 'TYPESAFE_API_KEY')
            return { value: apiKey };
        return { value: undefined };
    }
    function appendFetchCall(_$: any, e: any) {
        fetchCalls.push({ url: e.url, init: e.init });
        const text = JSON.stringify({ model: 'jev-latest', answers, usage: {} });
        return { value: { status: fetchStatus, ok: fetchStatus === 200, headers: {}, text } };
    }
    function appendToast(_$: any, e: any) {
        toasts.push(e.text);
        return { value: undefined };
    }
    on('fs.read', readFileText);
    on('env.get', getEnvValue);
    on('session.root', () => ({ value: '/work/p' }));
    on('http.fetch', appendFetchCall);
    on('ui.toast', appendToast);
    on('turn.complete', (_$: any, e: any) => ({ text: e.answer }));
    on('fs.exists', getFileExists);
    on('fs.write', appendFileWrite);
    on('clock.now', () => ({ value: Date.UTC(2026, 0, 2, 3, 4, 5) }));
    return { fetchCalls, toasts, readPaths, envNames, existsPaths, fileWrites };
}

function readRequestBody(fetchCalls: { url: string; init: any }[]) {
    return JSON.parse(fetchCalls[0]!.init.body);
}

function findResultWrites(fileWrites: { path: string; text: string }[]) {
    const resultWrites: { path: string; text: string }[] = [];
    for (const write of fileWrites) {
        if (write.path.includes('/hooks/results/'))
            resultWrites.push(write);
    }
    return resultWrites;
}

function readLoggedEntry(fileWrites: { path: string; text: string }[], questionName: string) {
    const resultWrites = findResultWrites(fileWrites);
    return JSON.parse(resultWrites[0]!.text)[questionName];
}

test('test_request_goes_to_the_typesafe_url_with_the_api_key', async ($, on) => {
    // The state template is a plain text with no placeholders.
    const { fetchCalls } = setUpStubs(on, QUESTIONS_TEXT, '{"rule":"fixed"}');
    // The turn ends, so the hook runs.
    await $.turn.complete(TURN_ANSWER);
    // The hook makes one request, to the TypeSafe address.
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0]!.url).toEqual('https://api.typesafe.ai/v1/systemone');
    // The request carries the key from the environment.
    expect(fetchCalls[0]!.init.headers.Authorization).toEqual('Bearer test-key');
});

test('test_request_body_holds_the_filled_state_and_the_unchanged_questions', async ($, on) => {
    // The template reads one value from the hook input and one from the other data.
    const stateText = '{"agentReply":"{{hook.answer}}","projectFolder":"{{other.projectFolder}}","rule":"fixed"}';
    const { fetchCalls } = setUpStubs(on, QUESTIONS_TEXT, stateText);
    // The turn ends, so the hook runs.
    await $.turn.complete(TURN_ANSWER);
    // The state has both placeholders filled and the fixed field unchanged.
    const body = readRequestBody(fetchCalls);
    expect(body.state).toEqual({ agentReply: 'found a crash', projectFolder: '/work/p', rule: 'fixed' });
    // The questions go out exactly as questions.json has them.
    expect(body.questions).toEqual(JSON.parse(QUESTIONS_TEXT));
    // The request names the model.
    expect(body.model).toEqual('jev-latest');
});

test('test_placeholder_alone_keeps_the_value_type', async ($, on) => {
    // The field holds only one placeholder, and that value is a number.
    const { fetchCalls } = setUpStubs(on, QUESTIONS_TEXT, '{"duration":"{{hook.durationMs}}"}');
    // The turn ends, so the hook runs.
    await $.turn.complete(TURN_ANSWER);
    // The field is the number 12, not the text "12".
    expect(readRequestBody(fetchCalls).state).toEqual({ duration: 12 });
});

test('test_placeholder_inside_text_fills_as_text', async ($, on) => {
    // The field mixes text and two placeholders. One has spaces inside its braces.
    const { fetchCalls } = setUpStubs(on, QUESTIONS_TEXT, '{"line":"Took {{hook.durationMs}} ms: {{ hook.answer }}"}');
    // The turn ends, so the hook runs.
    await $.turn.complete(TURN_ANSWER);
    // Both placeholders become text inside the line.
    expect(readRequestBody(fetchCalls).state).toEqual({ line: 'Took 12 ms: found a crash' });
});

test('test_placeholders_fill_inside_nested_objects_and_lists', async ($, on) => {
    // The template has placeholders inside an object, inside a list, and next to values that are not text.
    const stateText = '{"outer":{"reply":"{{hook.answer}}"},"items":["{{hook.turnId}}",{"folder":"{{other.projectFolder}}"},7,null,true]}';
    const { fetchCalls } = setUpStubs(on, QUESTIONS_TEXT, stateText);
    // The turn ends, so the hook runs.
    await $.turn.complete(TURN_ANSWER);
    // Every level is filled, and the other values stay as they were.
    expect(readRequestBody(fetchCalls).state).toEqual({ outer: { reply: 'found a crash' }, items: ['t1', { folder: '/work/p' }, 7, null, true] });
});

test('test_replacement_text_with_dollar_signs_stays_exact', async ($, on) => {
    // The answer holds a dollar pattern that text replacement can treat as special.
    const { fetchCalls } = setUpStubs(on, QUESTIONS_TEXT, '{"line":"said: {{hook.answer}}"}');
    // The turn ends with that answer, so the hook runs.
    await $.turn.complete({ ...TURN_ANSWER, answer: 'cost $& more' });
    // The dollar pattern stays exact in the line.
    expect(readRequestBody(fetchCalls).state).toEqual({ line: 'said: cost $& more' });
});

test('test_wrong_placeholder_name_stops_the_request', async ($, on) => {
    // The template names a hook field that does not exist.
    const { fetchCalls, toasts, readPaths } = setUpStubs(on, QUESTIONS_TEXT, '{"x":"{{hook.nope}}"}');
    // The turn ends, so the hook runs.
    await $.turn.complete(TURN_ANSWER);
    // The hook did run: it read the template.
    expect(readPaths.at(-1)!.endsWith('/hooks/state.json')).toEqual(true);
    // The hook stopped: it made no request and showed no toast.
    expect(fetchCalls).toHaveLength(0);
    expect(toasts).toHaveLength(0);
});

test('test_missing_api_key_stops_the_request', async ($, on) => {
    // The environment has no key.
    const { fetchCalls, envNames } = setUpStubs(on, QUESTIONS_TEXT, '{"rule":"fixed"}', { apiKey: undefined });
    // The turn ends, so the hook runs.
    await $.turn.complete(TURN_ANSWER);
    // The hook did run: it asked for the key.
    expect(envNames).toEqual(['TYPESAFE_API_KEY']);
    // The hook stopped: it made no request.
    expect(fetchCalls).toHaveLength(0);
});

test('test_failed_response_shows_no_answers', async ($, on) => {
    // TypeSafe answers with a failure status.
    const { fetchCalls, toasts } = setUpStubs(on, QUESTIONS_TEXT, '{"rule":"fixed"}', { fetchStatus: 500 });
    // The turn ends, so the hook runs.
    await $.turn.complete(TURN_ANSWER);
    // The hook did run: it made the request.
    expect(fetchCalls).toHaveLength(1);
    // The hook stopped: it showed no toast.
    expect(toasts).toHaveLength(0);
});

test('test_answers_show_as_one_line_per_question', async ($, on) => {
    // The mod asks three questions, and TypeSafe answers each one with a different answer type.
    const questionsText = '{"reportsBug":{"type":"noul","instructions":"Is it a bug?"},"mood":{"type":"choice","instructions":"How does it sound?","criteria":{"calm":"Calm.","angry":"Angry."}},"size":{"type":"score","instructions":"How big?","criteria":["Small.","Medium.","Large."]}}';
    const answers = {
        reportsBug: { type: 'noul', noul: 0.98 },
        mood: { type: 'choice', choice: 'calm', confidence: 0.8, probabilities: { calm: 0.9, angry: 0.1 } },
        size: { type: 'score', score: 1.7, probabilities: { 0: 0.0, 1: 0.3, 2: 0.7 } },
    };
    const { toasts } = setUpStubs(on, questionsText, '{"rule":"fixed"}', { answers });
    // The turn ends, so the hook runs.
    await $.turn.complete(TURN_ANSWER);
    // One toast shows one line per question, joined by a newline.
    expect(toasts).toEqual(['reportsBug: yes chance 0.98\nmood: calm (chance 0.9)\nsize: score 1.7']);
});

test('test_turn_text_passes_through_unchanged', async ($, on) => {
    // The stubs answer with a normal TypeSafe reply.
    const { toasts } = setUpStubs(on, QUESTIONS_TEXT, '{"rule":"fixed"}');
    // The turn ends, so the hook runs.
    const result = await $.turn.complete(TURN_ANSWER);
    // The hook did run: it showed its toast.
    expect(toasts).toHaveLength(1);
    // The turn result still has the answer as its text.
    expect((result as any).text).toEqual(TURN_ANSWER.answer);
});

const EXAMPLE_QUESTIONS_TEXT = JSON.stringify({
    reportsBug: {
        type: 'noul',
        instructions: '`projectFolder` is the project. `rule` defines a bug. Does `agentReply` report a bug?',
        criteria: { true: '`agentReply` reports a bug.', false: '`agentReply` does not report a bug.' },
    },
});
const EXAMPLE_STATE_TEXT = '{"agentReply":"found a crash","projectFolder":"/work/p","rule":"fixed"}';
const EXAMPLE_LOG_TEXT = '{\n    "reportsBug": {\n        "asked": "`projectFolder` is the project. `rule` defines a bug. Does `agentReply` report a bug?",\n        "answer": "Yes, `agentReply` reports a bug."\n    }\n}';
const LOGGING_OFF_TEXT = '{"values":{"typesafe-template":{"loggingEnabled":false}}}';
const LOGGING_ON_TEXT = '{"values":{"typesafe-template":{"loggingEnabled":true}}}';

test('test_logging_is_on_by_default_and_writes_the_answer_log', async ($, on) => {
    // No dispatcher file exists, and TypeSafe answers the example question with a high yes chance.
    const answers = { reportsBug: { type: 'noul', noul: 0.96 } };
    const { fileWrites } = setUpStubs(on, EXAMPLE_QUESTIONS_TEXT, EXAMPLE_STATE_TEXT, { answers });
    // The turn ends, so the hook runs.
    await $.turn.complete(TURN_ANSWER);
    // The hook writes one log file, named from the clock time.
    const resultWrites = findResultWrites(fileWrites);
    expect(resultWrites).toHaveLength(1);
    expect(resultWrites[0]!.path.endsWith('/hooks/results/2026-01-02T03-04-05-000Z.json')).toEqual(true);
    // The log holds the asked text and the yes text, with a 4-space indent.
    expect(resultWrites[0]!.text).toEqual(EXAMPLE_LOG_TEXT);
});

test('test_noul_below_half_logs_no_and_the_false_text', async ($, on) => {
    // TypeSafe answers the example question with a low yes chance.
    const answers = { reportsBug: { type: 'noul', noul: 0.2 } };
    const { fileWrites } = setUpStubs(on, EXAMPLE_QUESTIONS_TEXT, EXAMPLE_STATE_TEXT, { answers });
    // The turn ends, so the hook runs.
    await $.turn.complete(TURN_ANSWER);
    // The logged answer is "No, " and the false criteria text.
    expect(readLoggedEntry(fileWrites, 'reportsBug').answer).toEqual('No, `agentReply` does not report a bug.');
});

test('test_noul_without_criteria_logs_only_yes_or_no', async ($, on) => {
    // One question has no criteria, and one question has null criteria.
    const questionsText = '{"isLong":{"type":"noul","instructions":"Is it long?"},"isShort":{"type":"noul","instructions":"Is it short?","criteria":null}}';
    const answers = { isLong: { type: 'noul', noul: 0.7 }, isShort: { type: 'noul', noul: 0.3 } };
    const { fileWrites } = setUpStubs(on, questionsText, '{"rule":"fixed"}', { answers });
    // The turn ends, so the hook runs.
    await $.turn.complete(TURN_ANSWER);
    // The high chance logs "Yes", and the low chance logs "No".
    expect(readLoggedEntry(fileWrites, 'isLong').answer).toEqual('Yes');
    expect(readLoggedEntry(fileWrites, 'isShort').answer).toEqual('No');
});

test('test_noul_with_missing_criteria_text_logs_no_value', async ($, on) => {
    // The criteria has a false text but no true text, and TypeSafe answers with a high yes chance.
    const questionsText = '{"reportsBug":{"type":"noul","instructions":"Is it a bug?","criteria":{"false":"x"}}}';
    const answers = { reportsBug: { type: 'noul', noul: 0.9 } };
    const { fileWrites } = setUpStubs(on, questionsText, '{"rule":"fixed"}', { answers });
    // The turn ends, so the hook runs.
    await $.turn.complete(TURN_ANSWER);
    // The logged answer is "Yes, " and a marker for the missing text.
    expect(readLoggedEntry(fileWrites, 'reportsBug').answer).toEqual('Yes, <no defined value in \'criteria\'>');
});

test('test_choice_logs_the_chosen_option_text', async ($, on) => {
    // A choice question has one criteria text per option, and TypeSafe chooses "calm".
    const questionsText = '{"mood":{"type":"choice","instructions":"How does the reply sound?","criteria":{"calm":"The reply sounds calm.","angry":"The reply sounds angry."}}}';
    const answers = { mood: { type: 'choice', choice: 'calm', confidence: 0.8, probabilities: { calm: 0.9, angry: 0.1 } } };
    const { fileWrites } = setUpStubs(on, questionsText, '{"rule":"fixed"}', { answers });
    // The turn ends, so the hook runs.
    await $.turn.complete(TURN_ANSWER);
    // The logged answer is the criteria text of the chosen option.
    expect(readLoggedEntry(fileWrites, 'mood').answer).toEqual('The reply sounds calm.');
});

test('test_score_logs_the_most_likely_level_text', async ($, on) => {
    // A score question has one criteria text per level, and level 1 has the highest probability.
    const questionsText = '{"size":{"type":"score","instructions":"How big is the change?","criteria":["Small.","Medium.","Large."]}}';
    const answers = { size: { type: 'score', score: 1.1, probabilities: { 0: 0.0, 1: 0.91, 2: 0.09 } } };
    const { fileWrites } = setUpStubs(on, questionsText, '{"rule":"fixed"}', { answers });
    // The turn ends, so the hook runs.
    await $.turn.complete(TURN_ANSWER);
    // The logged answer is the criteria text of level 1.
    expect(readLoggedEntry(fileWrites, 'size').answer).toEqual('Medium.');
});

test('test_asked_uses_the_question_field_or_the_json_text', async ($, on) => {
    // One question has object instructions with a question field, and one has object instructions without it.
    const questionsText = '{"isRed":{"type":"noul","instructions":{"question":"Is it red?","context":"x"}},"isBlue":{"type":"noul","instructions":{"context":"y"}}}';
    const answers = { isRed: { type: 'noul', noul: 0.9 }, isBlue: { type: 'noul', noul: 0.1 } };
    const { fileWrites } = setUpStubs(on, questionsText, '{"rule":"fixed"}', { answers });
    // The turn ends, so the hook runs.
    await $.turn.complete(TURN_ANSWER);
    // The question field becomes the asked text.
    expect(readLoggedEntry(fileWrites, 'isRed').asked).toEqual('Is it red?');
    // Without a question field, the JSON text of the instructions becomes the asked text.
    expect(readLoggedEntry(fileWrites, 'isBlue').asked).toEqual('{"context":"y"}');
});

test('test_user_dispatch_false_turns_logging_off', async ($, on) => {
    // user-dispatch.json turns logging off for this mod.
    const { fetchCalls, existsPaths, fileWrites } = setUpStubs(on, EXAMPLE_QUESTIONS_TEXT, EXAMPLE_STATE_TEXT, { userDispatchText: LOGGING_OFF_TEXT });
    // The turn ends, so the hook runs.
    await $.turn.complete(TURN_ANSWER);
    // The hook did run: it looked for user-dispatch.json and made the request.
    expect(existsPaths[0]!.endsWith('/dispatcher/user-dispatch.json')).toEqual(true);
    expect(fetchCalls).toHaveLength(1);
    // The hook wrote no log file.
    expect(findResultWrites(fileWrites)).toHaveLength(0);
});

test('test_dispatch_false_turns_logging_off_without_user_dispatch', async ($, on) => {
    // user-dispatch.json does not exist, and dispatch.json turns logging off.
    const { fetchCalls, readPaths, fileWrites } = setUpStubs(on, EXAMPLE_QUESTIONS_TEXT, EXAMPLE_STATE_TEXT, { dispatchText: LOGGING_OFF_TEXT });
    // The turn ends, so the hook runs.
    await $.turn.complete(TURN_ANSWER);
    // The hook did run: it read dispatch.json and made the request.
    expect(readPaths[0]!.endsWith('/dispatcher/dispatch.json')).toEqual(true);
    expect(fetchCalls).toHaveLength(1);
    // The hook wrote no log file.
    expect(findResultWrites(fileWrites)).toHaveLength(0);
});

test('test_user_dispatch_true_wins_over_dispatch_false', async ($, on) => {
    // user-dispatch.json turns logging on, and dispatch.json turns it off.
    const options = { userDispatchText: LOGGING_ON_TEXT, dispatchText: LOGGING_OFF_TEXT };
    const { fileWrites } = setUpStubs(on, EXAMPLE_QUESTIONS_TEXT, EXAMPLE_STATE_TEXT, options);
    // The turn ends, so the hook runs.
    await $.turn.complete(TURN_ANSWER);
    // The hook writes one log file.
    expect(findResultWrites(fileWrites)).toHaveLength(1);
});

test('test_user_dispatch_without_the_mod_section_uses_dispatch_value', async ($, on) => {
    // user-dispatch.json has values for another mod only, and dispatch.json turns logging off.
    const options = { userDispatchText: '{"values":{"other-mod":{"x":"1"}}}', dispatchText: LOGGING_OFF_TEXT };
    const { fetchCalls, readPaths, fileWrites } = setUpStubs(on, EXAMPLE_QUESTIONS_TEXT, EXAMPLE_STATE_TEXT, options);
    // The turn ends, so the hook runs.
    await $.turn.complete(TURN_ANSWER);
    // The hook did run: it read user-dispatch.json, then dispatch.json, and made the request.
    expect(readPaths[0]!.endsWith('/dispatcher/user-dispatch.json')).toEqual(true);
    expect(readPaths[1]!.endsWith('/dispatcher/dispatch.json')).toEqual(true);
    expect(fetchCalls).toHaveLength(1);
    // The hook wrote no log file.
    expect(findResultWrites(fileWrites)).toHaveLength(0);
});

function isStateFileRead(readPaths: string[]): boolean {
    let isRead = false;
    for (const path of readPaths) {
        if (path.endsWith('/hooks/state.json'))
            isRead = true;
    }
    return isRead;
}

test('test_unknown_backtick_name_stops_the_request', async ($, on) => {
    // The instructions name `nope`, and neither the state nor the instructions have it.
    const questionsText = '{"reportsBug":{"type":"noul","instructions":"Does `nope` report a bug?"}}';
    const { fetchCalls, readPaths } = setUpStubs(on, questionsText, '{"rule":"fixed"}');
    // The turn ends, so the hook runs.
    await $.turn.complete(TURN_ANSWER);
    // The hook did run: it read state.json.
    expect(isStateFileRead(readPaths)).toEqual(true);
    // The hook stopped before the paid call.
    expect(fetchCalls).toHaveLength(0);
});

test('test_bad_question_shape_stops_the_request', async ($, on) => {
    // A choice question has no criteria.
    const questionsText = '{"mood":{"type":"choice","instructions":"How does it sound?"}}';
    const { fetchCalls, readPaths } = setUpStubs(on, questionsText, '{"rule":"fixed"}');
    // The turn ends, so the hook runs.
    await $.turn.complete(TURN_ANSWER);
    // The hook did run: it read state.json.
    expect(isStateFileRead(readPaths)).toEqual(true);
    // The hook stopped before the paid call.
    expect(fetchCalls).toHaveLength(0);
});

test('test_bad_state_shape_stops_the_request', async ($, on) => {
    // state.json holds a number, which is not a string, object or array.
    const { fetchCalls, readPaths } = setUpStubs(on, '{"isBox":{"type":"box"}}', '5');
    // The turn ends, so the hook runs.
    await $.turn.complete(TURN_ANSWER);
    // The hook did run: it read state.json.
    expect(isStateFileRead(readPaths)).toEqual(true);
    // The hook stopped before the paid call.
    expect(fetchCalls).toHaveLength(0);
});

test('test_name_in_own_instructions_passes', async ($, on) => {
    // The structured instructions name `field.value`, which only the instructions have.
    const questionsText = '{"isValid":{"type":"noul","instructions":{"field":{"value":3},"question":"Is `field.value` valid?"}}}';
    const answers = { isValid: { type: 'noul', noul: 0.9 } };
    const { fetchCalls, readPaths } = setUpStubs(on, questionsText, '{"rule":"fixed"}', { answers });
    // The turn ends, so the hook runs.
    await $.turn.complete(TURN_ANSWER);
    // The hook did run: it read state.json.
    expect(isStateFileRead(readPaths)).toEqual(true);
    // The name is found, so the hook makes the request.
    expect(fetchCalls).toHaveLength(1);
});
