import { ChangeSyncStorageSQL, SQLOptions, SQLStorage } from './ChangeSyncStorageSQL';
import { Connection } from 'mysql2/promise';

class MySQL2Storage implements SQLStorage<Connection> {
    private readonly connection: Connection;

    constructor(connection: Connection) {
        this.connection = connection;
    }

    async executeQuery<ResultType>(
        query: string,
        values: any[],
        options: SQLOptions<Connection>
    ): Promise<ResultType[]> {
        const connection = options && options.transactionConnection ? options.transactionConnection : this.connection;

        const [data] = await connection.query(query, values);

        return Array.isArray(data) ? (data as ResultType[]) : [];
    }
}

export class ChangeSyncStorageMySQL2<DataType> extends ChangeSyncStorageSQL<DataType, Connection> {
    public constructor(connection: Connection) {
        super(new MySQL2Storage(connection));
    }
}
