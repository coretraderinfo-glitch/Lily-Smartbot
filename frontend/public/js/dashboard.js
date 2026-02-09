/**
 * LILY FLEET COMMANDER LOGIC
 * High-performance master orchestrator controls.
 */

const state = {
    activeTab: 'overview',
    nodes: [
        { id: 'local', name: 'Local Host Node', url: 'http://localhost:3000', status: 'online', avatar: '🏠' },
        { id: 'hy01', name: 'Client Server: Hongye-01', url: 'hy-01.lily-smartbot.com', status: 'online', avatar: '🇲🇾' },
        { id: 'sgv', name: 'Client Server: SG-Vortex', url: 'sg-vortex.up.railway.app', status: 'connecting', avatar: '🇸🇬' }
    ]
};

async function init() {
    // Artificial load for professional feel
    setTimeout(() => {
        const loader = document.getElementById('masterLoader');
        if (loader) {
            loader.style.opacity = '0';
            setTimeout(() => loader.style.display = 'none', 600);
        }
    }, 1200);

    await fetchInfra();
    renderNodes();
    setupSwitchListeners();
}

/**
 * Fetch Live Infrastructure Data (GitHub/Railway)
 */
async function fetchInfra() {
    try {
        const res = await fetch('/api/infra');
        const data = await res.json();

        // Update Railway Metadata
        document.getElementById('infra-railway').textContent = `${data.railway.service} (${data.railway.env})`;
        document.getElementById('infra-url').textContent = data.railway.url;

        // Update GitHub Metadata
        document.getElementById('infra-github').textContent = `Repo: ${data.github.repo}`;
        document.getElementById('infra-branch').textContent = `Branch: ${data.github.branch} (${data.github.commit})`;

        // Update Local Node info
        state.nodes[0].url = `http://${data.railway.url}:3000`;
        renderNodes();
    } catch (e) {
        console.error('Infra Sync Failed');
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
    if (nodeId === 'local') {
        // Find local groups or redirect
        alert('Master logic is redirecting to the local node. Connecting to group nodes...');
    } else {
        alert(`Connecting to External Node: ${nodeId}\nStatus: Active Node Found`);
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
