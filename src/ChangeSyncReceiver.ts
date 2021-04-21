import { ConsoleLogger, Logger } from './Logger';
import { Request, Response, Router } from 'express';
import { StoredChangeEntry } from './storage/ChangeSyncStorage';
import { ChangeType } from './ChangeType';

export type ChangeSyncReceiverOptions = {
    type: string;
    logger?: Logger;
};

export type StatusResponse = {
    id: number;
    status: number;
    responseData: unknown;
    data: unknown;
}[];

const defaultOptions: Partial<ChangeSyncReceiverOptions> = {
    logger: new ConsoleLogger()
};

type ChangeResult = number | { status: number; data: unknown };

export abstract class ChangeSyncReceiver {
    private readonly type: string;
    private readonly logger: Logger;

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

    abstract create(data: StoredChangeEntry, request: Request): Promise<ChangeResult>;

    abstract update(data: StoredChangeEntry, request: Request): Promise<ChangeResult>;

    abstract delete(data: StoredChangeEntry, request: Request): Promise<ChangeResult>;

    private async middleware(req: Request, res: Response): Promise<any> {
        if (!req.body || !req.body.length) {
            return res.status(400).json({ message: 'Invalid request body, not a json-formatted array or empty' });
        }

        const statusResponse: StatusResponse = [];

        for (let i = 0; i < req.body.length; i++) {
            const data = req.body[i];
            const id = data.id;
            const changeType = data['changeType'];

            let status = 200;
            let handlerData: unknown;
            let error: Error | null = null;

            try {
                let result: ChangeResult;

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
                const loggingFunction = status >= 500 ? this.logger.error : this.logger.warn;

                loggingFunction(
                    (status === 500 ? 'Unexpected ' : '') + 'error in change sync "' + this.type + '" handler',
                    {
                        id,
                        data,
                        ...error
                    }
                );
            }

            statusResponse.push({
                id,
                status,
                responseData: handlerData,
                data
            });
        }

        this.logger.info(this.type + ' change sync: ' + req.body.data.length + ' items');

        res.json(statusResponse);
    }
}
