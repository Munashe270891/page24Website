// Dedicated Webbook Layout & Formatting Utility v2.2 (Resilient & Offline-Ready)

let historyStack = [];
let historyStep = -1;
let autoSaveTimer = null;
let activeTargetId = null;

function openLayoutFormatter(targetTextareaId) {
    activeTargetId = targetTextareaId;
    const targetArea = document.getElementById(targetTextareaId);
    if (!targetArea) return;

    let modal = document.getElementById('layout-formatter-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'layout-formatter-modal';
        modal.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.6); z-index: 2000; display: flex;
            align-items: center; justify-content: center;
        `;
        modal.innerHTML = `
            <div style="background: white; padding: 25px; border-radius: 8px; width: 90%; max-width: 700px; box-shadow: 0 4px 20px rgba(0,0,0,0.2); max-height: 90vh; overflow-y: auto;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                    <h3 style="margin: 0; color: #1e4d2b;"><i class="fas fa-magic"></i> AI Book Text & Layout Formatter</h3>
                    <span id="autosave-status" style="font-size: 11px; color: #27ae60; font-weight: bold;">● All changes saved</span>
                </div>
                <p style="font-size: 12px; color: #666; margin-bottom: 15px;">Format your book chapter into clean semantic HTML. Auto-saves every 20 seconds.</p>
                
                <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-bottom: 15px;">
                    <div>
                        <label style="font-size: 11px; font-weight: bold; display: block; margin-bottom: 5px;">GENRE / FORMAT MODE</label>
                        <select id="fmt-genre" style="width: 100%; padding: 8px; border-radius: 4px; border: 1px solid #ccc; font-size: 12px;">
                            <option value="prose">General / Novel / Devotional</option>
                            <option value="poetry">Poetry / Stanzas</option>
                            <option value="academic">Academic / Textbook</option>
                        </select>
                    </div>
                    <div>
                        <label style="font-size: 11px; font-weight: bold; display: block; margin-bottom: 5px;">TEXT ALIGNMENT</label>
                        <select id="fmt-align" style="width: 100%; padding: 8px; border-radius: 4px; border: 1px solid #ccc; font-size: 12px;">
                            <option value="left">Left Aligned</option>
                            <option value="center">Centered</option>
                            <option value="justify">Justified (Book Style)</option>
                        </select>
                    </div>
                    <div>
                        <label style="font-size: 11px; font-weight: bold; display: block; margin-bottom: 5px;">PARAGRAPH STYLE</label>
                        <select id="fmt-p-style" style="width: 100%; padding: 8px; border-radius: 4px; border: 1px solid #ccc; font-size: 12px;">
                            <option value="normal">Standard Spacing</option>
                            <option value="indent">First-Line Indent</option>
                            <option value="drop-cap">Drop Cap First Word</option>
                        </select>
                    </div>
                </div>

                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; flex-wrap: wrap; gap: 8px;">
                    <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                        <button type="button" onclick="applyFmtTag('h1')" style="padding: 5px 8px; font-size: 11px; background: #27ae60; color: white; border: none; border-radius: 4px; cursor: pointer;">H1 Title</button>
                        <button type="button" onclick="applyFmtTag('h2')" style="padding: 5px 8px; font-size: 11px; background: #27ae60; color: white; border: none; border-radius: 4px; cursor: pointer;">H2 Header</button>
                        <button type="button" onclick="applyFmtTag('subtitle')" style="padding: 5px 8px; font-size: 11px; background: #2980b9; color: white; border: none; border-radius: 4px; cursor: pointer;">Subtitle</button>
                        <button type="button" onclick="applyFmtTag('quote')" style="padding: 5px 8px; font-size: 11px; background: #d35400; color: white; border: none; border-radius: 4px; cursor: pointer;">Quote</button>
                        <button type="button" onclick="applyFmtTag('bold')" style="padding: 5px 8px; font-size: 11px; background: #34495e; color: white; border: none; border-radius: 4px; cursor: pointer;"><b>Bold</b></button>
                        <button type="button" onclick="applyFmtTag('italic')" style="padding: 5px 8px; font-size: 11px; background: #34495e; color: white; border: none; border-radius: 4px; cursor: pointer;"><i>Italic</i></button>
                    </div>
                    <div style="display: flex; gap: 6px;">
                        <button type="button" onclick="fmtUndo()" style="padding: 5px 8px; font-size: 11px; background: #7f8c8d; color: white; border: none; border-radius: 4px; cursor: pointer;" title="Undo"><i class="fas fa-undo"></i> Undo</button>
                        <button type="button" onclick="fmtRedo()" style="padding: 5px 8px; font-size: 11px; background: #7f8c8d; color: white; border: none; border-radius: 4px; cursor: pointer;" title="Redo"><i class="fas fa-redo"></i> Redo</button>
                    </div>
                </div>

                <div style="margin-bottom: 15px;">
                    <textarea id="fmt-working-area" rows="12" oninput="recordHistoryState()" style="width: 100%; padding: 10px; border: 1px solid #ccc; border-radius: 4px; font-family: inherit; box-sizing: border-box; font-size: 13px;"></textarea>
                </div>

                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <button type="button" onclick="saveAsDraft()" style="padding: 8px 15px; background: #d97706; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;"><i class="fas fa-save"></i> Save As Draft</button>
                    <div style="display: flex; gap: 10px;">
                        <button type="button" onclick="closeLayoutFormatter()" style="padding: 8px 15px; background: #e2e8f0; color: #333; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">Exit / Cancel</button>
                        <button type="button" onclick="confirmLayoutFormatter()" style="padding: 8px 20px; background: #1e4d2b; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;"><i class="fas fa-check"></i> Apply & Return to Dashboard</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    // Load existing working text or recover draft if saved locally
    const savedDraft = localStorage.getItem('draft_' + targetTextareaId);
    const initialText = savedDraft || targetArea.value;
    
    const workingArea = document.getElementById('fmt-working-area');
    workingArea.value = initialText;
    
    // Initialize history stack
    historyStack = [initialText];
    historyStep = 0;

    modal.style.display = 'flex';

    // Start auto-save loop every 20 seconds
    if (autoSaveTimer) clearInterval(autoSaveTimer);
    autoSaveTimer = setInterval(() => {
        performAutoSave();
    }, 20000);
}

function closeLayoutFormatter() {
    if (autoSaveTimer) clearInterval(autoSaveTimer);
    const modal = document.getElementById('layout-formatter-modal');
    if (modal) modal.style.display = 'none';
}

function recordHistoryState() {
    const workingArea = document.getElementById('fmt-working-area');
    const val = workingArea.value;
    
    if (historyStack[historyStep] !== val) {
        historyStep++;
        historyStack = historyStack.slice(0, historyStep);
        historyStack.push(val);
    }
    document.getElementById('autosave-status').innerText = "● Editing...";
    document.getElementById('autosave-status').style.color = "#d97706";
}

function fmtUndo() {
    if (historyStep > 0) {
        historyStep--;
        document.getElementById('fmt-working-area').value = historyStack[historyStep];
    }
}

function fmtRedo() {
    if (historyStep < historyStack.length - 1) {
        historyStep++;
        document.getElementById('fmt-working-area').value = historyStack[historyStep];
    }
}

function performAutoSave() {
    if (!activeTargetId) return;
    const val = document.getElementById('fmt-working-area').value;
    localStorage.setItem('draft_' + activeTargetId, val);
    
    const status = document.getElementById('autosave-status');
    if (status) {
        status.innerText = "● Auto-saved locally";
        status.style.color = "#27ae60";
    }
}

function saveAsDraft() {
    performAutoSave();
    
    // Optional: If Supabase client is available in your global scope, sync draft to database table
    if (typeof supabase !== 'undefined' && window.userSession) {
        // Example Supabase draft upsert hook
        /*
        supabase.from('book_drafts').upsert({
            user_id: window.userSession.id,
            target_field: activeTargetId,
            content: document.getElementById('fmt-working-area').value,
            updated_at: new Date()
        }).then(({ error }) => {
            if(error) console.error("Cloud sync error:", error.message);
        });
        */
    }

    alert("💾 Chapter draft saved successfully! You can safely exit or continue editing.");
}

function applyFmtTag(tagType) {
    const area = document.getElementById('fmt-working-area');
    const start = area.selectionStart;
    const end = area.selectionEnd;
    const selectedText = area.value.substring(start, end) || "Text here";
    
    let replacement = "";
    switch(tagType) {
        case 'h1': replacement = `<h1>${selectedText}</h1>`; break;
        case 'h2': replacement = `<h2>${selectedText}</h2>`; break;
        case 'subtitle': replacement = `<p class="subtitle">${selectedText}</p>`; break;
        case 'quote': replacement = `<blockquote>${selectedText}</blockquote>`; break;
        case 'bold': replacement = `<strong>${selectedText}</strong>`; break;
        case 'italic': replacement = `<em>${selectedText}</em>`; break;
    }

    area.value = area.value.substring(0, start) + replacement + area.value.substring(end);
    recordHistoryState();
}

function confirmLayoutFormatter() {
    if (!activeTargetId) return;
    const workingAreaVal = document.getElementById('fmt-working-area').value;
    const genre = document.getElementById('fmt-genre').value;
    const align = document.getElementById('fmt-align').value;
    const pStyle = document.getElementById('fmt-p-style').value;

    const targetArea = document.getElementById(activeTargetId);
    if (targetArea) {
        targetArea.value = parseTextToCleanHtml(workingAreaVal, genre, align, pStyle);
        // Clear local draft cache upon successful commit back to dashboard form
        localStorage.removeItem('draft_' + activeTargetId);
    }
    
    closeLayoutFormatter();
    // Triggers standard dashboard return transition or form state sync
}

function parseTextToCleanHtml(text, genre, alignment, paragraphStyle) {
    const lines = text.split(/\r?\n/);
    let htmlOutput = "";
    const alignStyle = alignment !== 'left' ? ` style="text-align: ${alignment};"` : '';

    if (genre === 'poetry') {
        let stanzaContent = "";
        for (let i = 0; i < lines.length; i++) {
            let line = lines[i].trim();
            if (!line) {
                if (stanzaContent) {
                    htmlOutput += `    <div class="stanza"${alignStyle}>\n${stanzaContent}    </div>\n\n`;
                    stanzaContent = "";
                }
            } else {
                stanzaContent += `        ${escapeHtml(line)}<br>\n`;
            }
        }
        if (stanzaContent) {
            htmlOutput += `    <div class="stanza"${alignStyle}>\n${stanzaContent}    </div>\n`;
        }
        return htmlOutput;
    }

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim();
        if (!line) continue;

        if (line.startsWith('<') && line.endsWith('>')) {
            htmlOutput += `    ${line}\n`;
            continue;
        }

        if (line.startsWith('"') || line.startsWith('“') || line.startsWith('—')) {
            htmlOutput += `    <blockquote${alignStyle}>${escapeHtml(line)}</blockquote>\n`;
            continue;
        }

        if (i === 0 && line.length < 60) {
            htmlOutput += `    <h1${alignStyle}>${escapeHtml(line)}</h1>\n`;
        } else if (line.length < 50 && (i === 1 || line.endsWith(':'))) {
            htmlOutput += `    <p class="subtitle"${alignStyle}>${escapeHtml(line)}</p>\n`;
        } else {
            let cssClass = '';
            if (paragraphStyle === 'indent') cssClass = ' class="indented"';
            if (paragraphStyle === 'drop-cap') cssClass = ' class="drop-cap"';
            
            htmlOutput += `    <p${cssClass}${alignStyle}>${escapeHtml(line)}</p>\n`;
        }
    }

    return htmlOutput;
}

function escapeHtml(str) {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
