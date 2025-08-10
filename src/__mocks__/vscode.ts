// Mock VS Code API for testing
export const Uri = {
  file: (path: string) => ({ fsPath: path, path })
};

export const workspace = {
  createFileSystemWatcher: jest.fn(() => ({
    onDidChange: jest.fn(),
    onDidCreate: jest.fn(),
    onDidDelete: jest.fn(),
    dispose: jest.fn()
  }))
};

export const Disposable = class {
  constructor(private callback: () => void) {}
  dispose() {
    this.callback();
  }
};

export interface WorkspaceFolder {
  uri: any;
  name: string;
  index: number;
}