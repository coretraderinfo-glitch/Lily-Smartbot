/**
 * LILY FLEET COMMANDER LOGIC
 * High-performance master orchestrator controls.
 */

const state = {
    activeTab: 'overview',
    nodes: [],
    stats: { nodes: 0, transactions: 0, uptime: 0 }
};

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
        const res = await fetch('/api/groups');
        const groups = await res.json();

        state.nodes = groups.map(g => ({
            id: g.id,
            name: g.title,
            url: window.location.origin, // Local node url for Master view
            status: 'online',
            avatar: '🛰️'
        }));

        renderNodes();
    } catch (e) {
        console.error('Node Discovery Failed');
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
                    <p>Endpoint: ${node.url}</p>
                </div>
            </div>
            <span class="status-badge status-${node.status === 'online' ? 'active' : 'offline'}">
                ${node.status}
            </span>
        </div>
    `).join('');
}

/**
 * Tab Switching Logic
 */
function switchTab(tabId) {
    state.activeTab = tabId;

    // Update Nav
    document.querySelectorAll('.nav-link').forEach(el => el.classList.remove('active'));
    const activeNav = document.getElementById(`nav-${tabId}`);
    if (activeNav) activeNav.classList.add('active');

    // Update Content Titles
    const titles = {
        overview: { t: 'Overview', s: 'Real-time surveillance of all active nodes and client servers.' },
        fleet: { t: 'Fleet Control', s: 'Manage individual client servers and global distribution.' },
        ai: { t: 'AI Core Activation', s: 'Control Lily Intellect parameters across the entire network.' },
        global: { t: 'Global Intelligence', s: 'Aggregated financial data and behavioral analytics.' },
        settings: { t: 'Master Settings', s: 'Core OS configurations and security protocols.' }
    };

    const header = titles[tabId] || titles.overview;
    document.getElementById('tabTitle').textContent = header.t;
    document.getElementById('tabSubtitle').textContent = header.s;

    // Logic for dynamic content can be added here
}

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
 * Node Access Logic
 */
async function openNode(nodeId) {
    try {
        const res = await fetch(`/api/master/token/${nodeId}`);
        const data = await res.json();
        if (data.token) {
            window.location.href = `/c/${data.token}`;
        } else {
            alert('Failed to generate master session for this node.');
        }
    } catch (e) {
        alert('Connection to Node Failed: Node may be in deep sleep or maintenance.');
    }
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
