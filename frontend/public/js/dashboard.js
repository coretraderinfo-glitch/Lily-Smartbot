/**
 * LILY MASTER DASHBOARD LOGIC
 */

async function init() {
    await fetchStats();
    await fetchGroups();
    await fetchOwners();

    // Auto-refresh stats every 30s
    setInterval(fetchStats, 30000);

    // Hide loader
    const loader = document.getElementById('loader');
    if (loader) {
        loader.style.opacity = '0';
        setTimeout(() => loader.style.display = 'none', 500);
    }
}

/**
 * Fetch System Stats
 */
async function fetchStats() {
    try {
        const res = await fetch('/api/stats');
        const data = await res.json();

        document.getElementById('stat-tx').textContent = data.transactions;
        document.getElementById('stat-groups').textContent = data.groups;
        document.getElementById('stat-operators').textContent = data.operators;

        const hours = Math.floor(data.uptime / 3600);
        document.getElementById('stat-uptime').textContent = `${hours}h`;
    } catch (e) {
        console.error('Stats Sync Failed');
    }
}

/**
 * Fetch Group List
 */
async function fetchGroups() {
    try {
        const res = await fetch('/api/groups');
        const groups = await res.json();

        const container = document.getElementById('group-list');
        if (groups.length === 0) {
            container.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 40px; color: var(--text-dim);">No Active Groups Found</td></tr>';
            return;
        }

        container.innerHTML = groups.map(g => `
            <tr class="row-hover">
                <td style="font-weight: 700;">${g.title || 'Untitled Node'}</td>
                <td style="font-family: monospace; color: var(--text-dim); font-size: 13px;">${g.id}</td>
                <td>${new Date(g.created_at).toLocaleDateString()}</td>
                <td>
                    <button class="btn-primary" style="padding: 8px 15px; font-size: 12px; border-radius: 8px;" onclick="manageGroup('${g.id}')">⚙️ MANAGE</button>
                </td>
            </tr>
        `).join('');
    } catch (e) {
        console.error('Group Sync Failed');
    }
}

/**
 * Fetch Owner List
 */
async function fetchOwners() {
    try {
        const res = await fetch('/api/master/owners');
        const owners = await res.json();
        const list = document.getElementById('owners-list');
        list.innerHTML = owners.map(id => `<div style="display:flex; justify-content:space-between; padding:10px; border-bottom:1px solid rgba(255,255,255,0.05);"><span>👑 OWNER_ID:</span> <span style="color:var(--primary);">${id}</span></div>`).join('');
    } catch (e) { }
}

/**
 * Tab Navigation
 */
function showTab(tabId) {
    // Update Nav
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    document.getElementById(`nav-${tabId}`).classList.add('active');

    // Update Sections
    document.querySelectorAll('.section').forEach(el => el.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');

    // Update Titles
    const titles = {
        dashboard: { t: 'Master Dashboard', s: 'Real-time system oversight & node analysis' },
        groups: { t: 'Node Management', s: 'Configure and monitor active bot instances' },
        functions: { t: 'System Functions', s: 'Master overrides and global bot behavioral logic' },
        security: { t: 'Security Protocol', s: 'Firewall status and authorized access registry' }
    };

    document.getElementById('tab-title').textContent = titles[tabId].t;
    document.getElementById('tab-subtitle').textContent = titles[tabId].s;
}

/**
 * Group Management Logic (Master Access)
 */
async function manageGroup(id) {
    try {
        const res = await fetch(`/api/master/token/${id}`);
        const data = await res.json();
        if (data.token) {
            window.location.href = `/c/${data.token}`;
        } else {
            alert('Failed to generate master access token.');
        }
    } catch (e) {
        alert('Security Sync Error');
    }
}

init();
