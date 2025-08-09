import { BranchTime, TrackingPreset, ExportData } from '../models';

/**
 * Validation utility functions
 */

/**
 * Validate BranchTime object
 * @param data Data to validate
 * @returns True if valid
 */
export function isValidBranchTime(data: any): data is BranchTime {
    return (
        data &&
        typeof data === 'object' &&
        typeof data.seconds === 'number' &&
        data.seconds >= 0 &&
        typeof data.lastUpdated === 'string' &&
        isValidISOString(data.lastUpdated) &&
        typeof data.sessionCount === 'number' &&
        data.sessionCount >= 0 &&
        typeof data.averageSessionTime === 'number' &&
        data.averageSessionTime >= 0
    );
}

/**
 * Validate TrackingPreset object
 * @param data Data to validate
 * @returns Validation result
 */
export function validateTrackingPreset(data: any): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!data || typeof data !== 'object') {
        errors.push('Preset must be an object');
        return { isValid: false, errors };
    }

    if (!data.name || typeof data.name !== 'string' || data.name.trim().length === 0) {
        errors.push('Preset name is required and must be a non-empty string');
    }

    if (data.description !== undefined && typeof data.description !== 'string') {
        errors.push('Preset description must be a string');
    }

    if (!data.settings || typeof data.settings !== 'object') {
        errors.push('Preset settings are required');
    } else {
        const settingsErrors = validatePresetSettings(data.settings);
        errors.push(...settingsErrors);
    }

    if (data.createdAt && !isValidISOString(data.createdAt)) {
        errors.push('Invalid createdAt timestamp');
    }

    if (data.lastUsed && !isValidISOString(data.lastUsed)) {
        errors.push('Invalid lastUsed timestamp');
    }

    return { isValid: errors.length === 0, errors };
}

/**
 * Validate preset settings
 * @param settings Settings to validate
 * @returns Array of error messages
 */
export function validatePresetSettings(settings: any): string[] {
    const errors: string[] = [];

    if (typeof settings.updateInterval !== 'number' || settings.updateInterval <= 0) {
        errors.push('Update interval must be a positive number');
    }

    if (typeof settings.autoRefresh !== 'boolean') {
        errors.push('Auto refresh must be a boolean');
    }

    if (typeof settings.displayFormat !== 'string') {
        errors.push('Display format must be a string');
    }

    if (typeof settings.trackingEnabled !== 'boolean') {
        errors.push('Tracking enabled must be a boolean');
    }

    return errors;
}

/**
 * Validate export data structure
 * @param data Data to validate
 * @returns True if valid
 */
export function isValidExportData(data: any): data is ExportData {
    return (
        data &&
        typeof data === 'object' &&
        typeof data.version === 'string' &&
        typeof data.exportedAt === 'string' &&
        isValidISOString(data.exportedAt) &&
        data.branchTimes &&
        typeof data.branchTimes === 'object' &&
        Object.values(data.branchTimes).every(isValidBranchTime) &&
        data.settings &&
        typeof data.settings === 'object' &&
        data.metadata &&
        typeof data.metadata === 'object'
    );
}

/**
 * Validate ISO string format
 * @param dateString String to validate
 * @returns True if valid ISO string
 */
export function isValidISOString(dateString: string): boolean {
    try {
        const date = new Date(dateString);
        return date.toISOString() === dateString;
    } catch {
        return false;
    }
}

/**
 * Validate branch name
 * @param branchName Branch name to validate
 * @returns True if valid
 */
export function isValidBranchName(branchName: string): boolean {
    return (
        typeof branchName === 'string' &&
        branchName.length > 0 &&
        branchName.length <= 255 &&
        !/[\x00-\x1f\x7f]/.test(branchName) // No control characters
    );
}

/**
 * Sanitize branch name for safe usage
 * @param branchName Branch name to sanitize
 * @returns Sanitized branch name
 */
export function sanitizeBranchName(branchName: string): string {
    return branchName
        .replace(/[\x00-\x1f\x7f]/g, '') // Remove control characters
        .trim()
        .substring(0, 255); // Limit length
}

/**
 * Validate email format (for export metadata)
 * @param email Email to validate
 * @returns True if valid email format
 */
export function isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}