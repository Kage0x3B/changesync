import { ConsoleLogger, Logger } from './Logger';
import { ChangeType } from './ChangeType';
import { ChangeResultState, ChangeSyncStorage, StoredChangeEntry } from './storage/ChangeSyncStorage';
import { StatusResponse } from './ChangeSyncReceiver';

const changeTypes = ['create', 'update', 'delete'];

export type ChangeSyncOptions = {
    type: string;
    apiFunction: (data: StoredChangeEntry[]) => Promise<StatusResponse>;
    syncCallback?: (syncResponse: StatusResponse) => void;
    logger?: Logger;
    syncStorage: ChangeSyncStorage;
};

const defaultOptions: Partial<ChangeSyncOptions> = {
    syncCallback: () => {},
    logger: new ConsoleLogger()
};

export type ChangeEntry = {
    changeType: ChangeType;
    data: Record<string, unknown>;
};

export class ChangeSync {
    private readonly type: string;
    private readonly apiFunction: (data: StoredChangeEntry[]) => Promise<StatusResponse>;
    private readonly syncCallback: (syncResponse: StatusResponse) => void;
    private readonly syncStorage: ChangeSyncStorage;
    private readonly logger: Logger;

    public constructor(options: ChangeSyncOptions) {
        options = {
            ...defaultOptions,
            ...options
        };

        this.type = options.type;
        this.apiFunction = options.apiFunction;
        this.syncCallback = options.syncCallback!;
        this.syncStorage = options.syncStorage;
        this.logger = options.logger!;
    }

    public async initStorage(): Promise<void> {
        await this.syncStorage.initStorage();
    }

    async addChange(changeType: ChangeType, data: Record<string, unknown>): Promise<void> {
        await this.syncStorage.addChange(this.type, changeType, data);

        await this.syncChanges();
    }

    //TODO: Does this work with ordering by created timestamp?
    /**
     * Batch inserts changelog entries
     * @param entries an array with entries, each an object having a changeType and data
     * @return {Promise<void>}
     */
    async batchAddChange(entries: ChangeEntry[]): Promise<void> {
        for (let i = 0; i < entries.length; i++) {
            if (!entries[i].changeType || !changeTypes.includes(entries[i].changeType)) {
                throw new Error('changeType has to be create, update or delete');
            }

            if (!entries[i].data) {
                throw new Error('Missing data');
            }
        }

        await this.syncStorage.batchAddChange(this.type, entries);

        await this.syncChanges();
    }

    async syncChanges(): Promise<void> {
        const syncData = await this.syncStorage.getPendingChanges(this.type);

        if (syncData.length) {
            let syncResults: StatusResponse;

            try {
                syncResults = await this.apiFunction(syncData);
            } catch (err) {
                const statusCode = err.response ? err.response.status : 500;

                syncResults = syncData.map((d) => ({
                    id: d.id,
                    status: statusCode,
                    responseData: undefined,
                    data: d.data
                }));
            }

            //TODO: What happens if this callback errors? Is the changelog still marked as received? Probably..
            await this.syncCallback(syncResults);

            const successfulIds = syncResults.filter((r) => r.status < 300).map((r) => r.id);
            const failedIds = syncResults.filter((r) => r.status >= 300).map((r) => r.id);

            if (successfulIds.length) {
                await this.syncStorage.saveChangeResults(this.type, ChangeResultState.SUCCESSFUL, successfulIds);
            }

            if (failedIds.length) {
                await this.syncStorage.saveChangeResults(this.type, ChangeResultState.FAILED, successfulIds);
            }
        }
    }
}
