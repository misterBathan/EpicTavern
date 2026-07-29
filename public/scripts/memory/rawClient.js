/**
 * Safe generateRaw wrapper for Memory capture.
 * Handles Claude extended-thinking "No message generated" by recovering text from the raw API body.
 */

import { generateRaw } from '../../script.js';

/**
 * @param {*} response
 * @returns {string}
 */
function extractTextFromResponse(response) {
    if (!response) {
        return '';
    }
    if (typeof response === 'string') {
        return response;
    }
    if (Array.isArray(response)) {
        const texts = response
            .filter(b => b && b.type === 'text' && typeof b.text === 'string')
            .map(b => b.text);
        if (texts.length) {
            return texts.join('\n');
        }
        const strings = response.filter(item => typeof item === 'string');
        if (strings.length) {
            return strings.join('\n');
        }
        return '';
    }
    if (response.content !== undefined && response.content !== null) {
        if (typeof response.content === 'string') {
            return response.content;
        }
        if (Array.isArray(response.content)) {
            const texts = response.content
                .filter(b => b && b.type === 'text' && typeof b.text === 'string')
                .map(b => b.text);
            if (texts.length) {
                return texts.join('\n');
            }
        }
    }
    if (response.choices?.[0]?.message?.content) {
        const c = response.choices[0].message.content;
        if (typeof c === 'string') {
            return c;
        }
        if (Array.isArray(c)) {
            const texts = c
                .filter(b => b && b.type === 'text' && typeof b.text === 'string')
                .map(b => b.text);
            if (texts.length) {
                return texts.join('\n');
            }
        }
    }
    if (typeof response.text === 'string') {
        return response.text;
    }
    if (typeof response.message === 'string') {
        return response.message;
    }
    if (response.message?.content && typeof response.message.content === 'string') {
        return response.message.content;
    }
    return '';
}

/**
 * @param {Parameters<typeof generateRaw>[0]} options
 * @returns {Promise<string>}
 */
export async function safeGenerateRaw(options) {
    let capturedRawData = null;
    const originalFetch = window.fetch;

    window.fetch = async function (...args) {
        const response = await originalFetch.apply(this, args);
        try {
            const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
            if (url.includes('/api/backends/chat-completions/generate') ||
                (url.includes('/api/backends/') && url.includes('/generate'))) {
                const clone = response.clone();
                capturedRawData = await clone.json();
            }
        } catch {
            /* ignore */
        }
        return response;
    };

    try {
        return await generateRaw(options);
    } catch (genErr) {
        if (genErr?.message?.includes('No message generated') && capturedRawData) {
            console.warn('[EpicTavern Memory] generateRaw empty; recovering from raw API body.');
            const extracted = extractTextFromResponse(capturedRawData);
            if (!extracted?.trim()) {
                throw new Error('Could not extract text from API response');
            }
            return extracted;
        }
        throw genErr;
    } finally {
        window.fetch = originalFetch;
    }
}
