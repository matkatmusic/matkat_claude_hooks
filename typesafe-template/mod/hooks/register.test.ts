import { test, expect } from 'claude-code/testing';

const QUESTIONS_TEXT = '{ "reportsBug": { "type": "noul", "instructions": "Does `agentReply` report a bug?" } }';
const NOUL_ANSWERS = { reportsBug: { type: 'noul', noul: 0.5 } };
const TURN_ANSWER = { answer: 'found a crash', durationMs: 12, isAborted: false, turnId: 't1', reason: 'answer' } as const;

type StubOptions = { apiKey?: string; fetchStatus?: number; answers?: unknown };

function setUpStubs(on: any, questionsText: string, stateText: string, options: StubOptions = {}) {
    const { fetchStatus = 200, answers = NOUL_ANSWERS } = options;
    const apiKey = 'apiKey' in options ? options.apiKey : 'test-key';
    const fetchCalls: { url: string; init: any }[] = [];
    const toasts: string[] = [];
    const readPaths: string[] = [];
    const envNames: string[] = [];
    function readFileText(_$: any, e: any) {
        readPaths.push(e.path);
        if (e.path.endsWith('/hooks/questions.json'))
            return { value: questionsText };
        if (e.path.endsWith('/hooks/state.json'))
            return { value: stateText };
        throw new Error(`unexpected read of ${e.path}`);
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
    return { fetchCalls, toasts, readPaths, envNames };
}

function readRequestBody(fetchCalls: { url: string; init: any }[]) {
    return JSON.parse(fetchCalls[0]!.init.body);
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
    // TypeSafe answers three questions, one of each answer type.
    const answers = {
        reportsBug: { type: 'noul', noul: 0.98 },
        mood: { type: 'choice', choice: 'calm', confidence: 0.8, probabilities: { calm: 0.9, angry: 0.1 } },
        size: { type: 'score', score: 1.7 },
    };
    const { toasts } = setUpStubs(on, QUESTIONS_TEXT, '{"rule":"fixed"}', { answers });
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
