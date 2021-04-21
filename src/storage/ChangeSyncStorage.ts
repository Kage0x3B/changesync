import { ChangeType } from '../ChangeType';
import { ChangeEntry } from '../ChangeSync';

export type StoredChangeEntry<DataType> = ChangeEntry<DataType> & {
    id: number;
};

export enum ChangeResultState {
    SUCCESSFUL,
    FAILED
}

export abstract class ChangeSyncStorage<DataType> {
    public async initStorage(): Promise<void> {}

    public abstract addChange(changeSyncType: string, changeType: ChangeType, data: DataType): Promise<void>;

    public async batchAddChange(
        changeSyncType: string,
        changeList: { changeType: ChangeType; data: DataType }[]
    ): Promise<void> {
        for (const change of changeList) {
            await this.addChange(changeSyncType, change.changeType, change.data);
        }
    }

    public abstract getPendingChanges(changeSyncType: string): Promise<StoredChangeEntry<DataType>[]>;

    public abstract saveChangeResults(
        changeSyncType: string,
        result: ChangeResultState,
        idList: number[]
    ): Promise<void>;
}
