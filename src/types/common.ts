/**
 * Common types and interfaces used throughout the extension
 */

/**
 * Disposable resource interface
 */
export interface Disposable {
    /**
     * Dispose of the resource
     */
    dispose(): void;
}

/**
 * Initializable interface
 */
export interface Initializable {
    /**
     * Initialize the component
     * @param context Initialization context
     */
    initialize(context?: any): Promise<void>;
}

/**
 * Configurable interface
 */
export interface Configurable<T = any> {
    /**
     * Configure the component
     * @param config Configuration object
     */
    configure(config: T): void;

    /**
     * Get current configuration
     * @returns Current configuration
     */
    getConfiguration(): T;
}

/**
 * Serializable interface
 */
export interface Serializable<T = any> {
    /**
     * Serialize to JSON
     * @returns Serialized data
     */
    toJSON(): T;

    /**
     * Deserialize from JSON
     * @param data Serialized data
     */
    fromJSON(data: T): void;
}

/**
 * Validatable interface
 */
export interface Validatable {
    /**
     * Validate the object
     * @returns Validation result
     */
    validate(): ValidationResult;
}

/**
 * Validation result
 */
export interface ValidationResult {
    /** Whether validation passed */
    isValid: boolean;
    /** Validation errors */
    errors: string[];
    /** Validation warnings */
    warnings: string[];
}

/**
 * Operation result
 */
export interface OperationResult<T = any> {
    /** Whether operation was successful */
    success: boolean;
    /** Result data */
    data?: T;
    /** Error if operation failed */
    error?: Error;
    /** Additional message */
    message?: string;
}

/**
 * Async operation result
 */
export type AsyncOperationResult<T = any> = Promise<OperationResult<T>>;

/**
 * Key-value pair
 */
export interface KeyValuePair<K = string, V = any> {
    key: K;
    value: V;
}

/**
 * Range interface
 */
export interface Range<T = number> {
    start: T;
    end: T;
}

/**
 * Point interface
 */
export interface Point<T = number> {
    x: T;
    y: T;
}

/**
 * Size interface
 */
export interface Size<T = number> {
    width: T;
    height: T;
}

/**
 * Rectangle interface
 */
export interface Rectangle<T = number> extends Point<T>, Size<T> {}

/**
 * Color interface
 */
export interface Color {
    red: number;
    green: number;
    blue: number;
    alpha?: number;
}

/**
 * Theme interface
 */
export interface Theme {
    name: string;
    colors: Record<string, Color | string>;
    isDark: boolean;
}

/**
 * Callback function type
 */
export type Callback<T = void> = () => T;

/**
 * Async callback function type
 */
export type AsyncCallback<T = void> = () => Promise<T>;

/**
 * Event handler function type
 */
export type EventHandler<T = any> = (event: T) => void;

/**
 * Async event handler function type
 */
export type AsyncEventHandler<T = any> = (event: T) => Promise<void>;

/**
 * Predicate function type
 */
export type Predicate<T = any> = (item: T) => boolean;

/**
 * Comparator function type
 */
export type Comparator<T = any> = (a: T, b: T) => number;

/**
 * Mapper function type
 */
export type Mapper<T, U> = (item: T) => U;

/**
 * Reducer function type
 */
export type Reducer<T, U> = (accumulator: U, current: T) => U;

/**
 * Deep partial type
 */
export type DeepPartial<T> = {
    [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

/**
 * Required fields type
 */
export type RequiredFields<T, K extends keyof T> = T & Required<Pick<T, K>>;

/**
 * Optional fields type
 */
export type OptionalFields<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/**
 * Mutable type (removes readonly)
 */
export type Mutable<T> = {
    -readonly [P in keyof T]: T[P];
};

/**
 * Constructor type
 */
export type Constructor<T = {}> = new (...args: any[]) => T;

/**
 * Abstract constructor type
 */
export type AbstractConstructor<T = {}> = abstract new (...args: any[]) => T;