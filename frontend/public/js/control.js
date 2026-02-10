/**
 * LILY MASTER CONTROL SCRIPT
 */

const state = {
    token: window.location.pathname.split('/').pop(),
    isSaving: false
};

// DOM Elements
const form = document.getElementById('masterForm');

const loader = document.getElementById('loader');
const toast = document.getElementById('toast');
const opList = document.getElementById('operatorList');

/**
 * World-Class Data Fetcher
 */
async function init() {
    try {
        const res = await fetch(`/api/data/${state.token}`);
        if (!res.ok) throw new Error('Access Revoked');

        const data = await res.json();

        // Populate UI
        document.getElementById('groupTitle').textContent = data.group.title;
        document.getElementById('ai_brain_enabled').checked = data.settings.ai_brain_enabled;
        document.getElementById('guardian_enabled').checked = data.settings.guardian_enabled;
        document.getElementById('show_decimals').checked = data.settings.show_decimals !== false;
        document.getElementById('language_mode').value = data.settings.language_mode || 'CN';
        document.getElementById('rate_in').value = data.settings.rate_in || 0;
        document.getElementById('rate_out').value = data.settings.rate_out || 0;
        document.getElementById('rate_usd').value = data.settings.rate_usd || 0;
        document.getElementById('rate_myr').value = data.settings.rate_myr || 0;

        renderOperators(data.operators);
        applyEntitlements(data.entitlements || []);

        // Hide Loader
        if (loader) {
            loader.style.opacity = '0';
            setTimeout(() => loader.style.display = 'none', 500);
        }

    } catch (err) {
        showToast('Security Breach: Link Invalid', true);
        console.error(err);
    }
}

/**
 * Enforce License Restrictions on UI
 */
function applyEntitlements(unlocked) {
    const isMaster = unlocked.includes('ALL');

    const features = [
        { id: 'ai_brain_enabled', key: 'AI_BRAIN' },
        { id: 'guardian_enabled', key: 'GUARDIAN' },
        { id: 'show_decimals', key: 'REPORT_DECIMALS' }
    ];

    features.forEach(f => {
        const el = document.getElementById(f.id);
        const hasAccess = isMaster || unlocked.includes(f.key);

        if (!hasAccess) {
            el.checked = false;
            el.disabled = true;
            // Add visual lock
            const container = el.closest('.control-item') || el.closest('.toggle-row');
            if (container) {
                container.style.opacity = '0.5';
                container.style.cursor = 'not-allowed';
                const title = container.querySelector('.control-title') || container.querySelector('span');
                if (title && !title.innerHTML.includes('🔒')) {
                    title.innerHTML += ' <small style="color:var(--warning); font-size:10px;">🔒 LOCKED</small>';
                }
            }
        }
    });
}

/**
 * Render Team List
 */
function renderOperators(operators) {
    if (!operators || operators.length === 0) {
        opList.innerHTML = '<p style="text-align:center; color: var(--text-dim);">No Operators Assigned</p>';
        return;
    }

    opList.innerHTML = operators.map(op => `
        <div class="toggle-row" style="background: rgba(255,255,255,0.03);">
            <div>
                <div style="font-weight: 700; font-size: 14px;">${op.username || op.user_id}</div>
                <div style="font-size: 11px; color: var(--text-dim); text-transform: uppercase;">${op.role}</div>
            </div>
            ${op.role !== 'OWNER' ? `<button class="btn-del" onclick="removeOp('${op.user_id}')">REMOVE</button>` : ''}
        </div>
    `).join('');
}

/**
 * Master Save Function
 */
form.onsubmit = async (e) => {
    e.preventDefault();
    if (state.isSaving) return;

    state.isSaving = true;
    const saveBtn = document.getElementById('saveBtn');
    saveBtn.textContent = 'SYNCING SETTINGS...';
    saveBtn.disabled = true;

    const payload = {
        token: state.token,
        ai_brain_enabled: document.getElementById('ai_brain_enabled').checked,
        guardian_enabled: document.getElementById('guardian_enabled').checked,
        show_decimals: document.getElementById('show_decimals').checked,
        language_mode: document.getElementById('language_mode').value,
        rate_in: parseFloat(document.getElementById('rate_in').value),
        rate_out: parseFloat(document.getElementById('rate_out').value),
        rate_usd: parseFloat(document.getElementById('rate_usd').value),
        rate_myr: parseFloat(document.getElementById('rate_myr').value)
    };

    try {
        const res = await fetch('/api/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            showToast('Sync Successful! 🚀');
        } else {
            showToast('Sync Failed: Check Permissions', true);
        }
    } catch (err) {
        showToast('Connection Error', true);
    } finally {
        state.isSaving = false;
        saveBtn.textContent = '🚀 SYNC MASTER SETTINGS';
        saveBtn.disabled = false;
    }
};

/**
 * Remove Operator
 */
window.removeOp = async (id) => {
    if (!confirm('Confirm Removal of this operator?')) return;

    try {
        const res = await fetch('/api/operator/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: state.token, target_id: id })
        });

        if (res.ok) {
            init(); // Refresh data
            showToast('Operator Removed');
        }
    } catch (err) {
        showToast('Action Failed', true);
    }
};

/**
 * Utils
 */
function showToast(msg, isError = false) {
    toast.textContent = msg;
    toast.className = 'toast' + (isError ? ' error' : '') + ' show';
    setTimeout(() => toast.className = 'toast', 4000);
}

// Start
init();
