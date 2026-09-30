// Dedicated Webbook Layout & Formatting Utility
function openLayoutFormatter(targetTextareaId) {
    const targetArea = document.getElementById(targetTextareaId);
    if (!targetArea) return;

    const rawText = targetArea.value;
    if (!rawText.trim()) {
        alert("Please enter or paste some text first before formatting.");
        return;
    }

    const formattedHtml = autoFormatTextToHtml(rawText);
    
    if (confirm("✨ Auto-Formatting Applied!\n\n• Paragraphs wrapped in <p>\n• First line turned into Heading <h1>\n• Quotes wrapped in <blockquote>\n\nApply changes to editor?")) {
        targetArea.value = formattedHtml;
    }
}

function autoFormatTextToHtml(text) {
    const lines = text.split(/\r?\n/);
    let htmlOutput = "";
    let isFirstHeading = true;

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim();
        if (!line) continue;

        if (line.startsWith('"') || line.startsWith('“') || line.startsWith('—')) {
            htmlOutput += `    <blockquote>${escapeHtml(line)}</blockquote>\n`;
        } else if (isFirstHeading && line.length < 60) {
            htmlOutput += `    <h2>${escapeHtml(line)}</h2>\n`;
            isFirstHeading = false;
        } else {
            htmlOutput += `    <p>${escapeHtml(line)}</p>\n`;
        }
    }
    return htmlOutput;
}

function escapeHtml(str) {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
