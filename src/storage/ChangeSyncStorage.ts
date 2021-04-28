import { ChangeType } from '../ChangeType';
import { ChangeEntry } from '../ChangeSync';

export type StoredChangeEntry<DataType> = ChangeEntry<DataType> & {
    id: number;
};

export enum ChangeResultState {
    SUCCESSFUL,
    FAILED
}

export abstract class ChangeSyncStorage<DataType, QueryOptions> {
    public async initStorage(options: Partial<QueryOptions>): Promise<void> {}

    public abstract addChange(
        changeSyncType: string,
        changeType: ChangeType,
        data: DataType,
        options: Partial<QueryOptions>
    ): Promise<void>;

    public async batchAddChange(
        changeSyncType: string,
        changeList: { changeType: ChangeType; data: DataType }[],
        options: Partial<QueryOptions>
    ): Promise<void> {
        for (const change of changeList) {
            await this.addChange(changeSyncType, change.changeType, change.data, options);
        }
    }

    public abstract getPendingChanges(
        changeSyncType: string,
        options: Partial<QueryOptions>
    ): Promise<StoredChangeEntry<DataType>[]>;

    public abstract saveChangeResults(
        changeSyncType: string,
        result: ChangeResultState,
        idList: number[],
        options: Partial<QueryOptions>
    ): Promise<void>;
}
