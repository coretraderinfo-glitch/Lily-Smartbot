/**
 * LILY VIEW SCRIPT
 */

const state = {
    token: window.location.pathname.split('/').pop()
};

const loader = document.getElementById('loader');

async function init() {
    try {
        const res = await fetch(`/api/view/${state.token}`);
        if (!res.ok) throw new Error('Revoked');

        const data = await res.json();

        // Populate Header
        document.getElementById('groupInfo').textContent = `${data.group.title} • ${data.date}`;

        // Populate Balances
        document.getElementById('mainBalance').textContent = data.balance;
        document.getElementById('totalIn').textContent = data.summary.in;
        document.getElementById('totalOut').textContent = `-${data.summary.out}`;

        // Secondary Balances (Conversions)
        const secondary = document.getElementById('secondaryBalances');
        secondary.innerHTML = data.conversions.map(c => `<span>${c.val} ${c.code}</span>`).join(' • ');

        // Transactions
        const txList = document.getElementById('txList');
        if (data.transactions.length === 0) {
            txList.innerHTML = '<tr><td colspan="4" style="text-align:center; color: var(--text-dim); padding: 40px;">No Transactions Yet</td></tr>';
        } else {
            txList.innerHTML = data.transactions.map(t => `
                <tr>
                    <td><div style="font-size: 11px; color: var(--text-dim);">${t.time}</div></td>
                    <td><div style="font-weight: 700;">${t.type === 'DEPOSIT' ? '➕ IN' : t.type === 'PAYOUT' ? '➖ OUT' : '↪️ RET'}</div></td>
                    <td><div style="font-weight: 800; color: ${t.type === 'DEPOSIT' ? 'var(--success)' : 'var(--danger)'}">${t.amount}</div></td>
                    <td><div style="font-size: 12px;">${t.op}</div></td>
                </tr>
            `).join('');
        }

        // PDF Link
        document.getElementById('downloadLink').href = `/pdf/${state.token}`;

        // Hide Loader
        loader.style.opacity = '0';
        setTimeout(() => loader.style.display = 'none', 500);

    } catch (err) {
        document.body.innerHTML = '<div style="height:100vh; display:flex; align-items:center; justify-content:center; flex-direction:column; text-align:center; padding:20px;"><h1>🚫 ACCESS DENIED</h1><p style="color:var(--text-dim);">This link has expired or is invalid.</p></div>';
    }
}

init();
