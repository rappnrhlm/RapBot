// extensions/ai/src/utils/formatter.js - Clean and optimize text specifically for WhatsApp

/**
 * Formats LLM Markdown output into clean, native WhatsApp formatting
 * @param {string} text
 * @returns {string}
 */
function formatWhatsApp(text) {
    if (!text || typeof text !== 'string') return '';

    let formatted = text;

    // 1. Remove horizontal rules (---, ***, ___, etc.)
    formatted = formatted.replace(/^[ \t]*[-*_]{3,}[ \t]*$/gm, '');

    // 2. Convert Markdown headings (# Title, ## Title, ### Title) to WhatsApp bold
    formatted = formatted.replace(/^[ \t]*#{1,6}[ \t]+(.+)$/gm, (match, title) => {
        const clean = title.replace(/^\*+|\*+$/g, '').trim();
        return `*${clean}*`;
    });

    // 3. Convert Markdown bold-italic (***text*** or ___text___)
    formatted = formatted.replace(/\*\*\*(.*?)\*\*\*/g, '*_$1_*');
    formatted = formatted.replace(/___(.*?)___/g, '_*$1*_');

    // 4. Convert Markdown bold (**text** or __text__) to WhatsApp bold (*text*)
    formatted = formatted.replace(/\*\*(.*?)\*\*/g, '*$1*');
    formatted = formatted.replace(/__(.*?)__/g, '*$1*');

    // 5. Convert bullet points: lines starting with `* `, `- `, `+ ` to `• `
    formatted = formatted.replace(/^[ \t]*[*+-][ \t]+/gm, '• ');

    // 6. Ensure clean spacing after bullet points (e.g. `•*Title*` -> `• *Title*`)
    formatted = formatted.replace(/^[ \t]*•(?!\s)/gm, '• ');

    // 7. Ensure space after bold title in bullet list (e.g. `• *Title:*Text` -> `• *Title:* Text`)
    formatted = formatted.replace(/^(•\s*\*[^*]+\*:?)(?=[^\s*])/gm, '$1 ');

    // 8. Fix outer asterisks on lines with nested asterisks (e.g. `*Catatan: oleh *dokter*.*` -> `_Catatan: oleh *dokter*._`)
    formatted = formatted.replace(/^\*([^*]*\*[^*]+\*[^*]*)\*$/gm, '_$1_');

    // 9. Clean up redundant multiple asterisks
    formatted = formatted.replace(/\*{3,}/g, '*');

    // 10. Remove excessive blank lines (max 1 empty line between paragraphs)
    formatted = formatted.replace(/\n{3,}/g, '\n\n');

    return formatted.trim();
}

module.exports = {
    formatWhatsApp
};
