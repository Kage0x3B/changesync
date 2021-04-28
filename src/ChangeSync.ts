import { ConsoleLogger, Logger } from './Logger';
import { ChangeType } from './ChangeType';
import { ChangeResultState, ChangeSyncStorage, StoredChangeEntry } from './storage';
import { StatusResponse } from './ChangeSyncReceiver';

const changeTypes = ['create', 'update', 'delete'];

export type ChangeSyncOptions<DataType, QueryOptions> = {
    type: string;
    apiFunction: (data: StoredChangeEntry<DataType>[]) => Promise<StatusResponse<DataType>>;
    syncCallback?: (syncResponse: StatusResponse<DataType>) => void;
    logger?: Logger;
    syncStorage: ChangeSyncStorage<DataType, QueryOptions>;
};

const defaultOptions: Partial<ChangeSyncOptions<unknown, unknown>> = {
    syncCallback: () => {},
    logger: new ConsoleLogger()
};

export type ChangeEntry<DataType> = {
    changeType: ChangeType;
    data: DataType;
};

export class ChangeSync<DataType, QueryOptions> {
    private readonly type: string;
    private readonly apiFunction: (data: StoredChangeEntry<DataType>[]) => Promise<StatusResponse<DataType>>;
    private readonly syncCallback: (syncResponse: StatusResponse<DataType>) => void;
    private readonly syncStorage: ChangeSyncStorage<DataType, QueryOptions>;
    private readonly logger: Logger;

    public constructor(options: ChangeSyncOptions<DataType, QueryOptions>) {
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

    public async initStorage(options?: QueryOptions): Promise<void> {
        await this.syncStorage.initStorage(options || {});
    }

    async addChange(changeType: ChangeType, data: DataType, options?: QueryOptions): Promise<void> {
        await this.syncStorage.addChange(this.type, changeType, data, options || {});

        await this.syncChanges();
    }

    //TODO: Does this work with ordering by created timestamp?
    /**
     *
     * Batch inserts changelog entries
     * @param entries an array with entries, each an object having a changeType and data
     * @param options
     * @return {Promise<void>}
     */
    async batchAddChange(entries: ChangeEntry<DataType>[], options?: QueryOptions): Promise<void> {
        for (let i = 0; i < entries.length; i++) {
            if (!entries[i].changeType || !changeTypes.includes(entries[i].changeType)) {
                throw new Error('changeType has to be create, update or delete');
            }

            if (!entries[i].data) {
                throw new Error('Missing data');
            }
        }

        await this.syncStorage.batchAddChange(this.type, entries, options || {});

        await this.syncChanges();
    }

    async syncChanges(options?: QueryOptions): Promise<void> {
        const syncData = (await this.syncStorage.getPendingChanges(
            this.type,
            options || {}
        )) as StoredChangeEntry<DataType>[];

        if (syncData.length) {
            let syncResults: StatusResponse<DataType>;

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
                await this.syncStorage.saveChangeResults(
                    this.type,
                    ChangeResultState.SUCCESSFUL,
                    successfulIds,
                    options || {}
                );
            }

            if (failedIds.length) {
                await this.syncStorage.saveChangeResults(this.type, ChangeResultState.FAILED, failedIds, options || {});
            }
        }
    }
}
