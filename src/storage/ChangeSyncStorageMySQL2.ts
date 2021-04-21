import { ChangeSyncStorageSQL, SQLStorage } from './ChangeSyncStorageSQL';
import { Connection } from 'mysql2/promise';

class MySQL2Storage implements SQLStorage {
    private connection: Connection;

    constructor(connection: Connection) {
        this.connection = connection;
    }

    async executeQuery<ResultType>(query: string, values?: any[]): Promise<ResultType[]> {
        const [data] = await this.connection.query(query, values);

        return Array.isArray(data) ? (data as ResultType[]) : [];
    }
}

export class ChangeSyncStorageMySQL2 extends ChangeSyncStorageSQL {
    public constructor(connection: Connection) {
        super(new MySQL2Storage(connection));
    }
}
