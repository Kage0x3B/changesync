import { ChangeResultState, ChangeSyncStorage, StoredChangeEntry } from './ChangeSyncStorage';
import { ChangeType } from '../ChangeType';

export interface SQLStorage<ConnectionType> {
    executeQuery<ResultType>(query: string, values: any[], options: SQLOptions<ConnectionType>): Promise<ResultType[]>;
}

export interface SQLOptions<ConnectionType> {
    transactionConnection?: ConnectionType;
}

export class ChangeSyncStorageSQL<DataType, ConnectionType> extends ChangeSyncStorage<
    DataType,
    SQLOptions<ConnectionType>
> {
    private sqlStorage: SQLStorage<ConnectionType>;

    constructor(sqlStorage: SQLStorage<ConnectionType>) {
        super();

        this.sqlStorage = sqlStorage;
    }

    async initStorage(options: SQLOptions<ConnectionType>): Promise<void> {
        await this.sqlStorage.executeQuery<void>(
            `create table if not exists changelog
             (
                 id           int auto_increment
                     primary key,
                 type         enum ('order', 'product', 'shop')    not null,
                 change_type  enum ('create', 'update', 'delete')  not null,
                 data         json                                 not null,
                 resend_count int        default 0                 not null,
                 received     tinyint(1) default 0                 not null,
                 created      timestamp  default CURRENT_TIMESTAMP not null
             );

            create index changelog_type_index
                on changelog (type);`,
            [],
            options
        );
    }

    async addChange(
        changeSyncType: string,
        changeType: ChangeType,
        data: DataType,
        options: SQLOptions<ConnectionType>
    ): Promise<void> {
        await this.sqlStorage.executeQuery(
            'INSERT INTO changelog (type, change_type, data) VALUES (?, ?, ?)',
            [changeSyncType, changeType, JSON.stringify(data)],
            options
        );
    }

    async batchAddChange(
        changeSyncType: string,
        changeList: { changeType: ChangeType; data: DataType }[],
        options: SQLOptions<ConnectionType>
    ): Promise<void> {
        const sqlData = changeList.map((e) => [changeSyncType, e.changeType, JSON.stringify(e.data)]);

        await this.sqlStorage.executeQuery<void>(
            'INSERT INTO changelog (type, change_type, data) VALUES ?',
            [sqlData],
            options
        );
    }

    async getPendingChanges(
        changeSyncType: string,
        options: SQLOptions<ConnectionType>
    ): Promise<StoredChangeEntry<DataType>[]> {
        return await this.sqlStorage.executeQuery(
            'SELECT id, change_type AS changeType, data FROM changelog WHERE type = ? AND received = FALSE AND resend_count < 5 ORDER BY created',
            [changeSyncType],
            options
        );
    }

    async saveChangeResults(
        changeSyncType: string,
        result: ChangeResultState,
        idList: number[],
        options: SQLOptions<ConnectionType>
    ): Promise<void> {
        if (result == ChangeResultState.SUCCESSFUL) {
            await this.sqlStorage.executeQuery(
                'UPDATE changelog SET received = TRUE WHERE id IN ?',
                [[idList]],
                options || {}
            );
        } else {
            await this.sqlStorage.executeQuery(
                'UPDATE changelog SET resend_count = resend_count + 1 WHERE id IN ?',
                [[idList]],
                options
            );
        }
    }
}
