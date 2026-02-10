
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
        { id: 1001, title: 'Local Node: Primary', created_at: new Date(), timezone: 'Asia/Kuala_Lumpur' }
    ],
    settings: {
        1001: {
            group_id: 1001,
            ai_brain_enabled: true,
            guardian_enabled: true,
            show_decimals: true,
            language_mode: 'EN',
            rate_usd: 4.5,
            rate_myr: 1.0
        }
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
        { node_id: 1, group_id: 1001 }
    ]
};

export class MockDB {
    async query(text: string, params: any[] = []): Promise<QueryResult<any>> {
        const query = text.toUpperCase().trim();
        let rows: any[] = [];

        // 1. SELECT Query Routing
        if (query.startsWith('SELECT')) {
            if (query.includes('FROM FLEET_NODES N') && query.includes('JOIN NODE_GROUPS NG')) {
                // Feature Entitlement Join
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
                rows = mockData.fleet_nodes;
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

        // 2. Mock Mutations (UPDATE/DELETE) just return success
        else if (query.startsWith('UPDATE') || query.startsWith('DELETE') || query.startsWith('INSERT')) {
            // Simulate success
            return {
                rows: [],
                command: 'UPDATE',
                rowCount: 1,
                oid: 0,
                fields: []
            };
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
