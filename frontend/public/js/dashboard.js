/**
 * LILY FLEET COMMANDER LOGIC
 * High-performance master orchestrator controls.
 */

const state = {
    activeTab: 'overview',
    nodes: [],
    stats: { nodes: 0, transactions: 0, uptime: 0 }
};

/**
 * High-Security Master Hub Communication
 */
async function masterFetch(url, options = {}) {
    const key = window.LilyConfig?.MASTER_KEY || '';
    const headers = {
        ...(options.headers || {}),
        'X-Master-Key': key,
        'Content-Type': 'application/json'
    };
    return fetch(url, { ...options, headers });
}

async function init() {
    // Instant Load (Zero Latency Mode)
    const loader = document.getElementById('masterLoader');
    if (loader) loader.style.display = 'none';

    await Promise.all([
        fetchInfra(),
        fetchStats(),
        fetchNodes()
    ]);

    setupSwitchListeners();
    // Force Initial Render
    switchTab(state.activeTab);

    // Auto-refresh every 60s
    setInterval(() => {
        fetchStats();
        fetchNodes();
    }, 60000);
}

/**
 * Fetch Statistics
 */
async function fetchStats() {
    try {
        const res = await fetch('/api/stats');
        const data = await res.json();
        document.getElementById('stat-tx').textContent = data.transactions || 0;
        document.getElementById('stat-nodes').textContent = data.groups || 0;
        document.getElementById('stat-reach').textContent = (data.operators * 10) + '+'; // Mocked reach based on operators
    } catch (e) {
        console.error('Stats Sync Failed');
    }
}

/**
 * Fetch Live Infrastructure Data
 */
async function fetchInfra() {
    try {
        const res = await fetch('/api/infra');
        const data = await res.json();

        // Update Railway Metadata
        const ryEl = document.getElementById('infra-railway');
        const urlEl = document.getElementById('infra-url');
        if (ryEl) ryEl.textContent = `${data.railway.service} (${data.railway.env})`;
        if (urlEl) urlEl.textContent = data.railway.url;

        // Update GitHub Metadata
        const ghEl = document.getElementById('infra-github');
        const brEl = document.getElementById('infra-branch');
        if (ghEl) ghEl.textContent = `Repo: ${data.github.repo}`;
        if (brEl) brEl.textContent = `Branch: ${data.github.branch} (${data.github.commit})`;
    } catch (e) {
        console.error('Infra Sync Failed');
    }
}

/**
 * Fetch Actual Group Nodes
 */
async function fetchNodes() {
    try {
        const res = await masterFetch('/api/fleet');
        if (!res.ok) throw new Error('Unauthorized Master Discovery');
        const fleet = await res.json();

        state.nodes = fleet.map(node => ({
            id: node.id,
            name: node.client_name,
            url: node.server_endpoint || 'Local Cluster',
            status: node.status.toLowerCase(),
            avatar: node.id === 1 ? '👑' : '🛰️',
            limit: node.group_limit,
            features: node.unlocked_features || [],
            groups: node.groups || [] // Now includes full group objects {id, title}
        }));

        if (state.activeTab === 'overview') {
            renderGlobalGroups();
        } else if (state.activeTab === 'fleet') {
            renderNodes();
        }
    } catch (e) {
        console.error('Fleet Discovery Failed');
    }
}

/**
 * Render Active Node Fleet
 */
function renderNodes() {
    const container = document.getElementById('nodeList');
    if (!container) return;

    container.innerHTML = state.nodes.map(node => `
        <div class="node-item" onclick="openNode('${node.id}')">
            <div class="node-info">
                <div class="node-avatar">${node.avatar}</div>
                <div class="node-details">
                    <h4>${node.name}</h4>
                    <p style="font-size: 11px; opacity: 0.7;">${node.url}</p>
                    <div style="display: flex; gap: 8px; margin-top: 4px;">
                        <div style="font-size: 10px; color: var(--accent); font-weight: 700;">CAP: ${node.limit}</div>
                        <div style="font-size: 10px; color: var(--success); font-weight: 700;">ACTIVE: ${node.groups.length}</div>
                    </div>
                </div>
            </div>
            <span class="status-badge status-${node.status === 'online' ? 'active' : 'offline'}">
                ${node.status}
            </span>
        </div>
    `).join('');
}

/**
 * Fleet Control: Open Management Modal
 */
window.openNode = (id) => {
    const node = state.nodes.find(n => n.id == id);
    if (!node) return;

    state.currentNode = node;

    document.getElementById('nodeModal').style.display = 'flex';
    document.getElementById('modalNodeName').textContent = node.name;
    document.getElementById('modalGroupLimit').value = node.limit;

    // Set feature toggles
    document.getElementById('feat_ai_brain').checked = node.features.includes('AI_BRAIN') || node.features.includes('ALL');
    document.getElementById('feat_guardian').checked = node.features.includes('GUARDIAN') || node.features.includes('ALL');
    document.getElementById('feat_reports').checked = node.features.includes('REPORT_DECIMALS') || node.features.includes('ALL');

    // Populate Group List (Tracing + Management)
    const list = document.getElementById('modalGroupList');
    if (list) {
        if (node.groups.length > 0) {
            list.innerHTML = node.groups.map(g => `
                <div class="group-trace-item" style="display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.03); padding: 8px 12px; border-radius: 8px; width: 100%; border: 1px solid var(--border);">
                    <div style="font-size: 13px; font-weight: 600;">${g.title}</div>
                    <button class="btn btn-outline" style="font-size: 10px; padding: 4px 8px;" onclick="adminGroup('${g.id}', '${node.url}')">
                        ⚙️ ADMIN SETTINGS
                    </button>
                </div>
            `).join('');
        } else {
            list.innerHTML = '<div style="font-size: 11px; color: var(--text-dim);">No active groups on this node.</div>';
        }
    }
};

/**
 * Administer specific group settings
 */
// --- 4. NAVIGATION & MODALS ---

/**
 * Open Secure Config Panel (New Tab)
 */
window.adminGroup = async (chatId, nodeUrl) => {
    try {
        // Step 1: Request ONE-TIME secure token from Master
        const res = await fetch(`/api/master/token/${chatId}`);
        const data = await res.json();

        if (data.token) {
            // Step 2: Redirect to Node with Token
            // If nodeUrl is localhost, use current origin
            const targetUrl = nodeUrl.includes('localhost') ? window.location.origin : nodeUrl;
            window.open(`${targetUrl}/c/${data.token}`, '_blank');
        } else {
            alert('Security Handshake Failed: Invalid Token Generation');
        }
    } catch (e) {
        console.error(e);
        alert('Cluster Connection Error: Node is unreachable.');
    }
};


/**
 * Tab Switching Logic
 */
function switchTab(tabId) {
    state.activeTab = tabId;

    // Update Sidebar State
    document.querySelectorAll('.nav-link').forEach(el => el.classList.remove('active'));
    const activeNav = document.getElementById(`nav-${tabId}`);
    if (activeNav) activeNav.classList.add('active');

    // Update Header Text
    const titles = {
        overview: { t: 'Overview', s: 'Real-time Group Intelligence and Master Control.' },
        fleet: { t: 'Fleet Control', s: 'Manage individual client servers and global distribution.' },
        ai: { t: 'AI Core Activation', s: 'Control Lily Intellect parameters across the entire network.' },
        settings: { t: 'Master Settings', s: 'Core OS configurations and security protocols.' }
    };

    const header = titles[tabId] || titles.overview;
    document.getElementById('tabTitle').textContent = header.t;
    document.getElementById('tabSubtitle').textContent = header.s;

    // Content Rendering Router
    const container = document.getElementById('nodeList');
    const panelTitle = document.getElementById('panelTitle');
    const panelSubtitle = document.getElementById('panelSubtitle');

    if (tabId === 'overview') {
        container.style.display = 'grid'; // Ensure grid layout
        if (panelTitle) panelTitle.textContent = 'Active Groups (Intelligence)';
        if (panelSubtitle) panelSubtitle.textContent = 'Real-time telemetry from all connected nodes.';
        renderGlobalGroups(); // Overview now shows the FULL picture
    } else if (tabId === 'fleet') {
        if (panelTitle) panelTitle.textContent = 'Fleet Management';
        if (panelSubtitle) panelSubtitle.textContent = 'Manage individual client servers and global distribution.';
        renderNodes(); // Fleet Control shows Server Nodes
    } else {
        // Fallback or Placeholder for AI/Settings
        container.innerHTML = `<div style="padding: 40px; text-align: center; color: var(--text-dim);">Module '${header.t}' is active but has no visual components yet.</div>`;
    }
}


/**
 * Render All Groups Across Fleet (Admin View)
 */
function renderGlobalGroups() {
    const container = document.getElementById('nodeList');
    if (!container) return;

    // Aggregate all groups from all nodes
    const allGroups = [];
    state.nodes.forEach(node => {
        if (node.groups) {
            node.groups.forEach(g => {
                allGroups.push({ ...g, nodeName: node.name, nodeUrl: node.url });
            });
        }
    });

    if (allGroups.length === 0) {
        container.innerHTML = `
            <div style="padding: 40px; text-align: center; color: var(--text-dim);">
                <h3>No Active Groups Found</h3>
                <p>Lily is not currently active in any Telegram groups.</p>
                <div style="margin-top: 16px; font-size: 11px; opacity: 0.7;">
                    Add Lily to a group to see it appear here automatically.
                </div>
            </div>`;
        return;
    }

    container.innerHTML = allGroups.map(g => `
        <div class="node-item" style="cursor: default; border-left: 3px solid var(--success); display: block; padding: 20px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 12px;">
                <div class="node-info">
                    <div class="node-avatar">💬</div>
                    <div class="node-details">
                        <h4 style="color: white; font-size: 16px;">${g.title}</h4>
                        <p style="font-size: 11px; opacity: 0.6; margin-top: 2px;">Node: <span style="color:var(--accent); font-weight:700;">${g.nodeName}</span></p>
                    </div>
                </div>
                <div class="node-actions" style="display: flex; gap: 8px;">
                    <button class="btn btn-outline" style="font-size: 10px; padding: 6px 12px;" onclick="adminGroup('${g.id}', '${g.nodeUrl}')">
                        ⚙️ CONFIG
                    </button>
                    <button class="btn btn-del" style="font-size: 10px; padding: 6px 12px; border: 1px solid var(--danger); color: var(--danger); background: transparent; border-radius: 6px; cursor: pointer;" onclick="deleteGroup('${g.id}')">
                        🗑️ REMOVE
                    </button>
                </div>
            </div>
            
            <div class="feature-toggles" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px;">
                <div class="toggle-card" style="background: rgba(255,255,255,0.03); padding: 10px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.05);">
                    <div style="font-size: 10px; font-weight: 800; color: var(--text-muted); margin-bottom: 8px; text-transform: uppercase;">AI BRAIN</div>
                    <div class="switch ${g.ai_enabled ? 'active' : ''}" id="switch-ai-${g.id}" onclick="toggleGroupFeature('${g.id}', 'AI_BRAIN', this)"></div>
                </div>
                <div class="toggle-card" style="background: rgba(255,255,255,0.03); padding: 10px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.05);">
                    <div style="font-size: 10px; font-weight: 800; color: var(--text-muted); margin-bottom: 8px; text-transform: uppercase;">GUARDIAN</div>
                    <div class="switch ${g.guardian_enabled ? 'active' : ''}" id="switch-guard-${g.id}" onclick="toggleGroupFeature('${g.id}', 'GUARDIAN', this)"></div>
                </div>
                <div class="toggle-card" style="background: rgba(255,255,255,0.03); padding: 10px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.05);">
                    <div style="font-size: 10px; font-weight: 800; color: var(--text-muted); margin-bottom: 8px; text-transform: uppercase;">REPORTS</div>
                    <div class="switch ${g.decimals_enabled ? 'active' : ''}" id="switch-rep-${g.id}" onclick="toggleGroupFeature('${g.id}', 'REPORT_DECIMALS', this)"></div>
                </div>
            </div>
        </div>
    `).join('');
}

/**
 * Surgical Feature Control for Master Hub
 */
window.toggleGroupFeature = async (chatId, feature, el) => {
    const isActactivating = !el.classList.contains('active');

    // Optimistic UI
    el.classList.toggle('active');
    el.style.pointerEvents = 'none';
    el.style.opacity = '0.5';

    try {
        const res = await masterFetch('/api/master/group/toggle', {
            method: 'POST',
            body: JSON.stringify({ chatId, feature, value: isActactivating })
        });

        if (!res.ok) throw new Error('Update Failed');

        console.log(`✅ Surgical Command Executed: ${feature} set to ${isActactivating} for Group ${chatId}`);
    } catch (e) {
        alert('Surgical Update Failed: Database Connection Interrupted');
        el.classList.toggle('active'); // Revert
    } finally {
        el.style.pointerEvents = 'auto';
        el.style.opacity = '1';
    }
};

/**
 * Force Delete Group (Ghost Protocol)
 */
window.deleteGroup = async (chatId) => {
    if (!confirm('🛑 WARNING: This will permanently delete this group from the registry.\n\nOnly proceed if the bot is already removed from the group.')) return;

    try {
        const res = await masterFetch('/api/master/group/delete', {
            method: 'POST',
            body: JSON.stringify({ chatId })
        });

        if (res.ok) {
            alert('Group Removed Successfully. 🗑️');
            fetchNodes(); // Refresh
        } else {
            alert('Failed to remove group.');
        }
    } catch (e) {
        alert('Server Error during deletion.');
    }
};

/**
 * UI Syncing
 */
function setupSwitchListeners() {
    document.querySelectorAll('.switch').forEach(sw => {
        sw.onclick = () => {
            sw.classList.toggle('active');
            // Here we would push global updates to all nodes
            console.log('Pushing Global Config Update...');
        };
    });
}


/**
 * Add New Cluster
 */
function addNode() {
    const name = prompt('Enter Client Name (e.g., Tiger-99):');
    if (!name) return;
    const url = prompt('Enter Server Endpoint (Railway or Domain):');
    if (!url) return;

    state.nodes.unshift({
        id: Date.now().toString(),
        name: `Client Server: ${name}`,
        url: url,
        status: 'connecting',
        avatar: '💎'
    });

    renderNodes();
    document.getElementById('stat-nodes').textContent = state.nodes.length;
}

init();
