export abstract class Logger {
    public info(message: string, ...args: any[]): void {
        this.log(LogLevel.INFO, message, args);
    }

    public warn(message: string, ...args: any[]): void {
        this.log(LogLevel.WARN, message, args);
    }

    public error(message: string, ...args: any[]): void {
        this.log(LogLevel.ERROR, message, args);
    }

    protected abstract log(tag: LogLevel, message: string, ...args: any[]): void;
}

export class ConsoleLogger extends Logger {
    protected log(tag: LogLevel, message: string, ...args: any[]): void {
        console[tag](message, args);
    }
}

export enum LogLevel {
    INFO = 'info',
    WARN = 'warn',
    ERROR = 'error'
}
