import { ConsoleLogger, Logger } from './Logger';
import { Request, Response, Router } from 'express';
import { StoredChangeEntry } from './storage';
import { ChangeType } from './ChangeType';

export type ChangeSyncReceiverOptions = {
    type: string;
    logger?: Logger;
};

export type StatusResponse<DataType> = {
    id: number;
    status: number;
    responseData: unknown;
    data: DataType;
}[];

const defaultOptions: Partial<ChangeSyncReceiverOptions> = {
    logger: new ConsoleLogger()
};

export type ChangeResult<DataType> = number | { status: number; data: DataType };

export abstract class ChangeSyncReceiver<DataType> {
    protected readonly type: string;
    protected readonly logger: Logger;

    public constructor(options: ChangeSyncReceiverOptions) {
        options = {
            ...defaultOptions,
            ...options
        };

        this.type = options.type;
        this.logger = options.logger!;
    }

    public registerMiddleware(router: Router): void {
        router.post(`/${this.type}`, this.middleware.bind(this));
    }

    protected abstract create(data: StoredChangeEntry<DataType>, request: Request): Promise<ChangeResult<DataType>>;

    protected abstract update(data: StoredChangeEntry<DataType>, request: Request): Promise<ChangeResult<DataType>>;

    protected abstract delete(data: StoredChangeEntry<DataType>, request: Request): Promise<ChangeResult<DataType>>;

    private async middleware(req: Request, res: Response): Promise<any> {
        if (!req.body || !req.body.length) {
            return res.status(400).json({ message: 'Invalid request body, not a json-formatted array or empty' });
        }

        const statusResponse: StatusResponse<DataType> = [];

        for (let i = 0; i < req.body.length; i++) {
            const data = req.body[i];
            const id = data.id;
            const changeType = data['changeType'];

            let status = 200;
            let handlerData: unknown;
            let error: Error | null = null;

            try {
                let result: ChangeResult<DataType>;

                if (changeType === ChangeType.CREATE) {
                    result = await this.create(data, req);
                } else if (changeType === ChangeType.UPDATE) {
                    result = await this.update(data, req);
                } else {
                    result = await this.delete(data, req);
                }

                if (typeof result === 'object') {
                    status = result.status;
                    handlerData = result.data;
                } else {
                    status = result;
                }
            } catch (err) {
                error = err;
                status = 500;

                this.logger.error('Change sync handler error', err);
            }

            if (status >= 300) {
                const logMessage =
                    (status === 500 ? 'Unexpected ' : '') + 'error in change sync "' + this.type + '" handler';
                const logData = {
                    id,
                    data,
                    ...error
                };

                if (status >= 500) {
                    this.logger.error(logMessage, logData);
                } else {
                    this.logger.warn(logMessage, logData);
                }
            }

            statusResponse.push({
                id,
                status,
                responseData: handlerData,
                data
            });
        }

        this.logger.info(this.type + ' change sync: ' + req.body.length + ' items');

        res.json(statusResponse);
    }
}
