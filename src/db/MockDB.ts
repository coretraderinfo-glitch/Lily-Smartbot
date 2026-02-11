
import { QueryResult } from 'pg';

// Simple In-Memory Data Store for "Server-less" Mode
const mockData: {
    groups: any[],
    settings: { [key: number]: any },
    operators: any[],
    transactions: any[],
    fleet_nodes: any[],
    node_groups: any[]
} = {
    groups: [
        { id: 1001, title: 'Global Hub: Primary', created_at: new Date(), timezone: 'Asia/Kuala_Lumpur' },
        { id: 2001, title: 'Tiger VIP', created_at: new Date(), timezone: 'Asia/Kuala_Lumpur' },
        { id: 2002, title: 'Tiger Trading', created_at: new Date(), timezone: 'Asia/Kuala_Lumpur' }
    ],
    settings: {
        1001: { group_id: 1001, ai_brain_enabled: true, guardian_enabled: true, show_decimals: true, language_mode: 'EN', rate_usd: 4.5, rate_myr: 1.0, rate_in: 3, rate_out: 3 },
        2001: { group_id: 2001, ai_brain_enabled: false, guardian_enabled: true, show_decimals: true, language_mode: 'CN', rate_usd: 4.6, rate_myr: 1.0, rate_in: 5, rate_out: 5 },
        2002: { group_id: 2002, ai_brain_enabled: false, guardian_enabled: false, show_decimals: false, language_mode: 'EN', rate_usd: 4.4, rate_myr: 1.0, rate_in: 2, rate_out: 2 }
    },
    operators: [
        { user_id: 1, username: 'SystemAdmin', role: 'OWNER' }
    ],
    transactions: [],
    fleet_nodes: [
        { id: 1, client_name: 'Master Cluster', server_endpoint: 'https://lily-smartbot-production.up.railway.app', status: 'ONLINE', group_limit: 999, unlocked_features: ['ALL', 'AI_BRAIN', 'GUARDIAN', 'REPORT_DECIMALS'] },
        { id: 2, client_name: 'Tiger Group (Sub-01)', server_endpoint: 'http://localhost:3000', status: 'ONLINE', group_limit: 5, unlocked_features: ['LEDGER', 'EXCEL'] }
    ],
    node_groups: [
        { node_id: 1, group_id: 1001 },
        { node_id: 2, group_id: 2001 },
        { node_id: 2, group_id: 2002 }
    ]
};

export class MockDB {
    async query(text: string, params: any[] = []): Promise<QueryResult<any>> {
        const query = text.toUpperCase().trim();
        let rows: any[] = [];

        // 1. SELECT Query Routing
        if (query.startsWith('SELECT')) {
            if (query.includes('FROM FLEET_NODES N') && query.includes('JOIN NODE_GROUPS NG') && query.includes('WHERE NG.GROUP_ID =')) {
                // Feature Entitlement Join (Single Group Lookup)
                const groupId = params[0];
                const link = mockData.node_groups.find(n => n.group_id == groupId);
                if (link) {
                    const node = mockData.fleet_nodes.find(n => n.id == link.node_id);
                    rows = node ? [node] : [];
                }
            }
            else if (query.includes('COUNT(*)')) {
                // Return stats
                if (query.includes('FROM TRANSACTIONS')) rows = [{ count: mockData.transactions.length }];
                else if (query.includes('FROM GROUPS')) rows = [{ count: mockData.groups.length }];
                else if (query.includes('FROM GROUP_OPERATORS')) rows = [{ count: mockData.operators.length }];
                else if (query.includes('FROM FLEET_NODES')) rows = [{ count: mockData.fleet_nodes.length }];
            }
            else if (query.includes('FROM FLEET_NODES')) {
                rows = mockData.fleet_nodes.map(node => {
                    const nodeGroups = mockData.node_groups
                        .filter(ng => ng.node_id === node.id);

                    const groups = nodeGroups.map(ng => {
                        const g = mockData.groups.find(group => group.id === ng.group_id);
                        const s = mockData.settings[g.id] || {
                            ai_brain_enabled: false,
                            guardian_enabled: false,
                            show_decimals: false,
                            mc_enabled: false
                        };
                        return {
                            id: g.id,
                            title: g.title,
                            ai_enabled: s.ai_brain_enabled,
                            guardian_enabled: s.guardian_enabled,
                            decimals_enabled: s.show_decimals,
                            mc_enabled: s.mc_enabled
                        };
                    });

                    return {
                        ...node,
                        groups: groups,
                        group_titles: groups.map(g => g.title),
                        active_groups: groups.length
                    };
                });
            }
            else if (query.includes('FROM GROUPS')) {
                // List Groups
                if (query.includes('WHERE ID =')) {
                    const id = params[0];
                    rows = mockData.groups.filter(g => g.id == id);
                } else {
                    rows = mockData.groups;
                }
            }
            else if (query.includes('FROM GROUP_SETTINGS')) {
                // Get Settings
                const groupId = params[0];
                rows = mockData.settings[groupId] ? [mockData.settings[groupId]] : [];
            }
            else if (query.includes('FROM GROUP_OPERATORS')) {
                // Get Operators
                rows = mockData.operators;
            }
            else if (query.includes('FROM TRANSACTIONS')) {
                // Get Transactions (empty)
                rows = [];
            }
        }

        // 2. Mock Mutations (UPDATE/DELETE) 
        else if (query.startsWith('UPDATE GROUP_SETTINGS')) {
            if (params.length === 2) {
                // Single Feature Toggle
                const groupId = params[1];
                const value = params[0];
                if (mockData.settings[groupId]) {
                    if (query.includes('AI_BRAIN_ENABLED')) mockData.settings[groupId].ai_brain_enabled = value;
                    else if (query.includes('GUARDIAN_ENABLED')) mockData.settings[groupId].guardian_enabled = value;
                    else if (query.includes('SHOW_DECIMALS')) mockData.settings[groupId].show_decimals = value;
                }
            } else {
                // Full Config Save
                const groupId = params[8];
                if (mockData.settings[groupId]) {
                    mockData.settings[groupId].ai_brain_enabled = params[0];
                    mockData.settings[groupId].guardian_enabled = params[1];
                    mockData.settings[groupId].show_decimals = params[2];
                    mockData.settings[groupId].language_mode = params[3];
                    mockData.settings[groupId].rate_in = params[4];
                    mockData.settings[groupId].rate_out = params[5];
                    mockData.settings[groupId].rate_usd = params[6];
                    mockData.settings[groupId].rate_myr = params[7];
                }
            }
            return { rows: [], command: 'UPDATE', rowCount: 1, oid: 0, fields: [] };
        }
        else if (query.startsWith('DELETE FROM GROUPS')) {
            const id = params[0];
            mockData.groups = mockData.groups.filter(g => g.id != id);
            // Cascade Delete (Simulation)
            delete mockData.settings[id];
            mockData.node_groups = mockData.node_groups.filter(ng => ng.group_id != id);
            return { rows: [], command: 'DELETE', rowCount: 1, oid: 0, fields: [] };
        }
        else if (query.startsWith('UPDATE') || query.startsWith('DELETE') || query.startsWith('INSERT')) {
            // Simulate success for others
            return { rows: [], command: 'UPDATE', rowCount: 1, oid: 0, fields: [] };
        }

        // Return PG-compatible Result Structure
        return {
            rows,
            command: 'SELECT',
            rowCount: rows.length,
            oid: 0,
            fields: []
        };
    }

    // Mock Client for Migrations
    async getClient() {
        return {
            query: (text: string, params: any[]) => this.query(text, params),
            release: () => { }
        };
    }

    async migrate() {
        console.log('⚡ MockDB Active: Skipping Migrations (In-Memory Mode)');
    }
}
