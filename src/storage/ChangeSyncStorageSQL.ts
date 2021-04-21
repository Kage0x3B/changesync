import { ChangeResultState, ChangeSyncStorage, StoredChangeEntry } from './ChangeSyncStorage';
import { ChangeType } from '../ChangeType';

export interface SQLStorage {
    executeQuery<ResultType>(query: string, values?: any[]): Promise<ResultType[]>;
}

export class ChangeSyncStorageSQL<DataType> extends ChangeSyncStorage<DataType> {
    private sqlStorage: SQLStorage;

    constructor(sqlStorage: SQLStorage) {
        super();

        this.sqlStorage = sqlStorage;
    }

    async initStorage(): Promise<void> {
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
                on changelog (type);`
        );
    }

    async addChange(changeSyncType: string, changeType: ChangeType, data: DataType): Promise<void> {
        await this.sqlStorage.executeQuery('INSERT INTO changelog (type, change_type, data) VALUES (?, ?, ?)', [
            changeSyncType,
            changeType,
            data
        ]);
    }

    async batchAddChange(
        changeSyncType: string,
        changeList: { changeType: ChangeType; data: DataType }[]
    ): Promise<void> {
        const sqlData = changeList.map((e) => [changeSyncType, e.changeType, e.data]);

        await this.sqlStorage.executeQuery<void>('INSERT INTO changelog (type, change_type, data) VALUES ?', [sqlData]);
    }

    async getPendingChanges(changeSyncType: string): Promise<StoredChangeEntry<DataType>[]> {
        return await this.sqlStorage.executeQuery(
            'SELECT id, change_type AS changeType, data FROM changelog WHERE type = ? AND received = FALSE AND resend_count < 5 ORDER BY created',
            [changeSyncType]
        );
    }

    async saveChangeResults(changeSyncType: string, result: ChangeResultState, idList: number[]): Promise<void> {
        if (result == ChangeResultState.SUCCESSFUL) {
            await this.sqlStorage.executeQuery('UPDATE changelog SET received = TRUE WHERE id IN ?', [idList]);
        } else {
            await this.sqlStorage.executeQuery('UPDATE changelog SET resend_count = resend_count + 1 WHERE id IN ?', [
                idList
            ]);
        }
    }
}
