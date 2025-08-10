import { GitService, GitError } from '../GitService';

describe('GitService', () => {
    let gitService: GitService;

    beforeEach(() => {
        gitService = new GitService();
    });

    afterEach(() => {
        gitService.dispose();
    });

    describe('initialization', () => {
        it('should create GitService instance', () => {
            expect(gitService).toBeDefined();
            expect(gitService).toBeInstanceOf(GitService);
        });

        it('should handle disposal correctly', () => {
            gitService.dispose();
            // Should not throw when disposing multiple times
            expect(() => gitService.dispose()).not.toThrow();
        });
    });

    describe('error handling', () => {
        it('should create GitError with proper properties', () => {
            const error = new GitError('Test error', 'TEST_CODE', 'stderr output');
            
            expect(error.message).toBe('Test error');
            expect(error.code).toBe('TEST_CODE');
            expect(error.stderr).toBe('stderr output');
            expect(error.name).toBe('GitError');
            expect(error).toBeInstanceOf(Error);
            expect(error).toBeInstanceOf(GitError);
        });

        it('should create GitError without stderr', () => {
            const error = new GitError('Test error', 'TEST_CODE');
            
            expect(error.message).toBe('Test error');
            expect(error.code).toBe('TEST_CODE');
            expect(error.stderr).toBeUndefined();
        });
    });

    describe('branch change watching', () => {
        it('should allow registering and disposing branch change callbacks', () => {
            const callback = jest.fn();
            const disposable = gitService.watchBranchChanges(callback);
            
            expect(disposable).toBeDefined();
            expect(typeof disposable.dispose).toBe('function');
            
            // Should not throw when disposing
            expect(() => disposable.dispose()).not.toThrow();
        });

        it('should handle multiple callbacks', () => {
            const callback1 = jest.fn();
            const callback2 = jest.fn();
            
            const disposable1 = gitService.watchBranchChanges(callback1);
            const disposable2 = gitService.watchBranchChanges(callback2);
            
            expect(disposable1).toBeDefined();
            expect(disposable2).toBeDefined();
            
            // Should not throw when disposing
            expect(() => {
                disposable1.dispose();
                disposable2.dispose();
            }).not.toThrow();
        });
    });

    describe('repository status', () => {
        it('should return repository status', async () => {
            const status = await gitService.getRepositoryStatus();
            
            expect(status).toBeDefined();
            expect(typeof status.isValid).toBe('boolean');
            expect(status.currentBranch).toBeNull(); // No workspace initialized
            expect(typeof status.branchCount).toBe('number');
            expect(typeof status.lastCheckTime).toBe('number');
            expect(typeof status.watchersActive).toBe('boolean');
        });
    });
});