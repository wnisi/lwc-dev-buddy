// class-hierarchy-extension/src/extension.ts
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

// Represents a class node in our hierarchy
class ClassNode {
    name: string;
    filePath: string;
    children: ClassNode[] = [];
    // Track custom tags related to this class
    customTags: { tag: string, line: number, context: string }[] = [];

    constructor(name: string, filePath: string) {
        this.name = name;
        this.filePath = filePath;
    }
}

// Class analyzer to build relationships
class ClassAnalyzer {
    private workspaceRoot: string;
    
    constructor(workspaceRoot: string) {
        this.workspaceRoot = workspaceRoot;
    }

    // Find class relationships in the codebase
    async buildClassHierarchy(mainClassName: string): Promise<ClassNode | null> {
        // Find the main class file
        const mainClassFile = await this.findClassFile(mainClassName);
        if (!mainClassFile) {
            return null;
        }

        // Create the root node
        const rootNode = new ClassNode(mainClassName, mainClassFile);
        
        // Find custom tags used in this class's template files
        await this.findCustomTags(rootNode);
        
        // Find all potential child classes
        const childClasses = await this.findPotentialChildClasses(mainClassName);
        
        // Build children recursively
        for (const child of childClasses) {
            const childNode = await this.buildClassHierarchy(child.name);
            if (childNode) {
                rootNode.children.push(childNode);
            }
        }
        
        return rootNode;
    }

    // Find the file containing a class
    private async findClassFile(className: string): Promise<string | null> {
        // This is a simplified implementation
        const files = await vscode.workspace.findFiles('**/*.{ts,js,java,cs,cpp,py,html}');
        
        for (const file of files) {
            const content = fs.readFileSync(file.fsPath, 'utf8');
            
            // For JavaScript/TypeScript files, look for class definitions
            if (/\.(js|ts)$/.test(file.fsPath)) {
                const classRegex = new RegExp(`class\\s+${className}\\b`, 'g');
                if (classRegex.test(content)) {
                    return file.fsPath;
                }
            }
            // For HTML files, look for LWC component definitions
            else if (/\.html$/.test(file.fsPath)) {
                // Check if the HTML file corresponds to an LWC with this class name
                const baseName = path.basename(file.fsPath, '.html');
                if (baseName.toLowerCase() === className.toLowerCase()) {
                    return file.fsPath;
                }
            }
        }
        
        return null;
    }

    // Find all potential child classes of a given class
    private async findPotentialChildClasses(parentClassName: string): Promise<{name: string, filePath: string}[]> {
        const result: {name: string, filePath: string}[] = [];
        const files = await vscode.workspace.findFiles('**/*.{ts,js,java,cs,cpp,py}');
        
        for (const file of files) {
            const content = fs.readFileSync(file.fsPath, 'utf8');
            
            // Look for classes extending the parent class
            const extendsRegex = new RegExp(`class\\s+(\\w+)\\s+extends\\s+${parentClassName}\\b`, 'g');
            let match;
            
            while ((match = extendsRegex.exec(content)) !== null) {
                result.push({
                    name: match[1],
                    filePath: file.fsPath
                });
            }
            
            // For LWC, also check for component usage in HTML files
            if (/\.js$/.test(file.fsPath) && content.includes(parentClassName)) {
                // Get the component name from the file
                const componentName = path.basename(file.fsPath, '.js');
                if (componentName.toLowerCase() !== parentClassName.toLowerCase()) {
                    result.push({
                        name: componentName,
                        filePath: file.fsPath
                    });
                }
            }
        }
        
        return result;
    }

    // Find custom tags (<c-*>) in HTML files related to a class
    private async findCustomTags(classNode: ClassNode): Promise<void> {
        try {
            // First check for an HTML template file in the same directory
            const dirPath = path.dirname(classNode.filePath);
            const baseName = path.basename(classNode.filePath).split('.')[0];
            const htmlFilePath = path.join(dirPath, `${baseName}.html`);
            
            if (fs.existsSync(htmlFilePath)) {
                const content = fs.readFileSync(htmlFilePath, 'utf8');
                const lines = content.split('\n');
                
                // Process each line to find custom tags
                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];
                    // Look for <c- tags
                    const tagMatches = line.match(/<c-([a-zA-Z0-9_-]+)/g);                    
                    
                    if (tagMatches) {
                        for (const tagMatch of tagMatches) {
                            classNode.customTags.push({
                                tag: tagMatch,
                                line: i + 1,
                                context: line.trim()
                            });
                        }
                    }
                }
            }
            
            // Also check JS file content for imports that might indicate component usage
            if (fs.existsSync(classNode.filePath)) {
                const content = fs.readFileSync(classNode.filePath, 'utf8');
                const lines = content.split('\n');
                
                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];
                    // Look for imports from other LWC components
                    if (line.includes('import') && line.includes('c/')) {
                        const importMatch = line.match(/import\s+\w+\s+from\s+['"]c\/(\w+)['"]/);
                        if (importMatch) {
                            classNode.customTags.push({
                                tag: `<c-${importMatch[1]}>`,
                                line: i + 1,
                                context: line.trim()
                            });
                        }
                    }
                }
            }
        } catch (error) {
            console.error(`Error finding custom tags for ${classNode.name}:`, error);
        }
    }

    // Get all classes from a specific folder
    async getClassesFromFolder(folderName: string): Promise<{name: string, filePath: string}[]> {
        const result: {name: string, filePath: string}[] = [];
        
        // Find all files in the specified folder
        const folderGlob = `**/${folderName}/**/*.{js,html}`;
        const files = await vscode.workspace.findFiles(folderGlob);
        
        for (const file of files) {
            try {
                const content = fs.readFileSync(file.fsPath, 'utf8');
                const fileName = path.basename(file.fsPath);
                
                // For JavaScript files (LWC controllers)
                if (fileName.endsWith('.js')) {
                    // Extract class names using regex
                    const classRegex = /class\s+(\w+)/g;
                    let match;
                    
                    while ((match = classRegex.exec(content)) !== null) {
                        result.push({
                            name: match[1],
                            filePath: file.fsPath
                        });
                    }
                    
                    // Also add the component name itself (for LWC)
                    const componentName = path.basename(file.fsPath, '.js');
                    result.push({
                        name: componentName,
                        filePath: file.fsPath
                    });
                }
                
                // For HTML files, check for custom tags
                if (fileName.endsWith('.html')) {
                    // Check if the file contains <c- tags
                    if (content.includes('<c-')) {
                        // Add the component that this HTML belongs to
                        const componentName = path.basename(file.fsPath, '.html');
                        result.push({
                            name: componentName,
                            filePath: file.fsPath
                        });
                    }
                }
            } catch (error) {
                console.error(`Error processing file ${file.fsPath}:`, error);
            }
        }
        
        // Remove duplicates based on name and filePath combined
        const uniqueResults = result.filter((item, index, self) => 
            index === self.findIndex(t => t.name === item.name && t.filePath === item.filePath)
        );
        
        return uniqueResults;
    }
    
    // Find all <c-tag> usages across the workspace
    async findAllCustomTagUsages(): Promise<{tag: string, filePath: string, line: number, context: string}[]> {
        const result: {tag: string, filePath: string, line: number, context: string}[] = [];
        
        // Find all HTML files
        const files = await vscode.workspace.findFiles('**/*.html');
        
        for (const file of files) {
            try {
                const content = fs.readFileSync(file.fsPath, 'utf8');
                const lines = content.split('\n');
                
                // Process each line to find custom tags
                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];
                    // Look for <c- tags
                    const tagMatches = line.match(/<c-([a-zA-Z0-9_-]+)/g);
                    
                    if (tagMatches) {
                        for (const tagMatch of tagMatches) {
                            result.push({
                                tag: tagMatch,
                                filePath: file.fsPath,
                                line: i + 1,
                                context: line.trim()
                            });
                        }
                    }
                }
            } catch (error) {
                console.error(`Error processing file ${file.fsPath}:`, error);
            }
        }
        
        return result;
    }
}

// Tree data provider for VS Code's TreeView
class ClassHierarchyProvider implements vscode.TreeDataProvider<HierarchyItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<HierarchyItem | undefined> = new vscode.EventEmitter<HierarchyItem | undefined>();
    readonly onDidChangeTreeData: vscode.Event<HierarchyItem | undefined> = this._onDidChangeTreeData.event;
    
    private rootNode: ClassNode | null = null;
    
    constructor(private workspaceRoot: string) {}
    
    refresh(rootNode: ClassNode | null): void {
        this.rootNode = rootNode;
        this._onDidChangeTreeData.fire(undefined);
    }
    
    getTreeItem(element: HierarchyItem): vscode.TreeItem {
        return element;
    }
    
    getChildren(element?: HierarchyItem): HierarchyItem[] {
        if (!this.rootNode) {
            return [];
        }
        
        // Root level - show the main class
        if (!element) {
            const rootItem = new ClassHierarchyItem(
                this.rootNode.name,
                this.rootNode.filePath,
                vscode.TreeItemCollapsibleState.Expanded
            );
            return [rootItem];
        }
        
        // Find the corresponding class node
        const classNode = this.findClassNode(this.rootNode, element.label.toString());
        if (!classNode) {
            return [];
        }
        
        const items: HierarchyItem[] = [];
        
        // Add a section for custom tags if they exist
        if (classNode.customTags.length > 0) {
            const tagsSection = new TagsSectionItem(
                "Custom Tags",
                vscode.TreeItemCollapsibleState.Expanded
            );
            items.push(tagsSection);
        }
        
        // Add child classes
        for (const child of classNode.children) {
            const childItem = new ClassHierarchyItem(
                child.name,
                child.filePath,
                child.children.length > 0 || child.customTags.length > 0 
                    ? vscode.TreeItemCollapsibleState.Collapsed 
                    : vscode.TreeItemCollapsibleState.None
            );
            items.push(childItem);
        }
        
        // If this is the tags section, add tag items
        if (element instanceof TagsSectionItem) {
            const parentNode = this.findClassNode(this.rootNode, element.parentClassName || "");
            if (parentNode) {
                return parentNode.customTags.map(tag => new TagItem(
                    tag.tag.replace(/<c-/, '').replace(/>/, ''),
                    tag.context,
                    tag.line,
                    parentNode.filePath,
                    vscode.TreeItemCollapsibleState.None
                ));
            }
        }
        
        return items;
    }
    
    private findClassNode(root: ClassNode, className: string): ClassNode | null {
        if (root.name === className) {
            return root;
        }
        
        for (const child of root.children) {
            const found = this.findClassNode(child, className);
            if (found) {
                return found;
            }
        }
        
        return null;
    }
}

// Base class for tree items
abstract class HierarchyItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(label, collapsibleState);
    }
}

// Class item in the hierarchy
class ClassHierarchyItem extends HierarchyItem {
    constructor(
        public readonly label: string,
        public readonly filePath: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(label, collapsibleState);
        
        this.tooltip = filePath;
        this.description = path.basename(path.dirname(filePath));
        this.iconPath = new vscode.ThemeIcon('symbol-class');
        
        this.command = {
            command: 'classHierarchy.openFile',
            title: 'Open File',
            arguments: [filePath]
        };
    }
}

// Section item for custom tags
class TagsSectionItem extends HierarchyItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly parentClassName?: string
    ) {
        super(label, collapsibleState);
        this.iconPath = new vscode.ThemeIcon('symbol-namespace');
        this.contextValue = 'tagsSection';
    }
}

// Individual tag item
class TagItem extends HierarchyItem {
    constructor(
        public readonly label: string,
        public readonly context: string,
        public readonly line: number,
        public readonly filePath: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(label, collapsibleState);
        
        this.tooltip = context;
        this.description = `Line ${line}`;
        this.iconPath = new vscode.ThemeIcon('symbol-event');
        
        this.command = {
            command: 'classHierarchy.openFileAtLine',
            title: 'Open File at Line',
            arguments: [filePath, line]
        };
    }
}

export function activate(context: vscode.ExtensionContext) {
    const workspaceRoot = vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0].uri.fsPath : '';
    const classAnalyzer = new ClassAnalyzer(workspaceRoot);
    const classHierarchyProvider = new ClassHierarchyProvider(workspaceRoot);
    
    // Register the TreeView
    const treeView = vscode.window.createTreeView('classHierarchyExplorer', {
        treeDataProvider: classHierarchyProvider,
        showCollapseAll: true
    });
    
    // Command to select the main class from a folder
    context.subscriptions.push(
        vscode.commands.registerCommand('classHierarchy.selectMainClass', async () => {
            // Default folder name - use configuration or default to LWC
            const config = vscode.workspace.getConfiguration('classHierarchy');
            let folderName = config.get<string>('defaultFolder') || "LWC"; 
            
            // Option to change the folder
            const changeFolderOption = "Change folder filter...";
            const options = [`Use default folder (${folderName})`, changeFolderOption];
            
            const folderOption = await vscode.window.showQuickPick(options, {
                placeHolder: "Use default folder or change folder filter?"
            });
            
            if (!folderOption) {
                return; // User cancelled
            }
            
            if (folderOption === changeFolderOption) {
                const customFolder = await vscode.window.showInputBox({
                    prompt: 'Enter folder name to filter classes (e.g., "LWC")',
                    value: folderName
                });
                
                if (!customFolder) {
                    return; // User cancelled
                }
                
                folderName = customFolder;
            }
            
            // Show loading indicator
            vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `Finding classes in folder '${folderName}'...`,
                cancellable: false
            }, async () => {
                try {
                    // Get all classes from the specified folder
                    const classes = await classAnalyzer.getClassesFromFolder(folderName);
                    
                    if (classes.length === 0) {
                        vscode.window.showInformationMessage(`No classes found in folder '${folderName}'`);
                        return;
                    }
                    
                    // Create QuickPick items with class name and file path
                    const classItems = classes.map(c => ({
                        label: c.name,
                        description: path.relative(workspaceRoot, c.filePath),
                        detail: `Full path: ${c.filePath}`,
                        className: c.name
                    }));
                    
                    // Allow user to select a class
                    const selectedClass = await vscode.window.showQuickPick(classItems, {
                        placeHolder: `Select a class from folder '${folderName}'`
                    });
                    
                    if (selectedClass) {
                        // Build and display the hierarchy
                        vscode.window.withProgress({
                            location: vscode.ProgressLocation.Notification,
                            title: `Building class hierarchy for ${selectedClass.className}...`,
                            cancellable: false
                        }, async () => {
                            const rootNode = await classAnalyzer.buildClassHierarchy(selectedClass.className);
                            if (rootNode) {
                                classHierarchyProvider.refresh(rootNode);
                            } else {
                                vscode.window.showErrorMessage(`Could not build hierarchy for class '${selectedClass.className}'`);
                            }
                        });
                    }
                } catch (error) {
                    vscode.window.showErrorMessage(`Error finding classes: ${error}`);
                }
            });
        })
    );
    
    // Command to find all custom tags across workspace
    context.subscriptions.push(
        vscode.commands.registerCommand('classHierarchy.findAllCustomTags', async () => {
            vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Finding all <c-*> custom tags in workspace...',
                cancellable: false
            }, async () => {
                try {
                    const tagUsages = await classAnalyzer.findAllCustomTagUsages();
                    
                    if (tagUsages.length === 0) {
                        vscode.window.showInformationMessage('No custom <c-*> tags found in the workspace');
                        return;
                    }
                    
                    // Group by tag name for better organization
                    const tagsByName = tagUsages.reduce((acc, current) => {
                        const tagName = current.tag.replace(/<c-/, '').replace(/>/, '');
                        if (!acc[tagName]) {
                            acc[tagName] = [];
                        }
                        acc[tagName].push(current);
                        return acc;
                    }, {} as Record<string, typeof tagUsages>);
                    
                    // Create items for the QuickPick
                    const items = Object.entries(tagsByName).map(([tagName, usages]) => ({
                        label: tagName,
                        description: `${usages.length} usage(s)`,
                        usages
                    }));
                    
                    // Allow user to select a tag
                    const selectedTag = await vscode.window.showQuickPick(items, {
                        placeHolder: 'Select a custom tag to view its usages'
                    });
                    
                    if (selectedTag) {
                        // Show the usages of the selected tag
                        const usageItems = selectedTag.usages.map(usage => ({
                            label: path.basename(usage.filePath),
                            description: `Line ${usage.line}`,
                            detail: usage.context,
                            usage
                        }));
                        
                        const selectedUsage = await vscode.window.showQuickPick(usageItems, {
                            placeHolder: `Select a usage of <c-${selectedTag.label}> to open`
                        });
                        
                        if (selectedUsage) {
                            // Open the file at the specified line
                            const document = await vscode.workspace.openTextDocument(selectedUsage.usage.filePath);
                            const editor = await vscode.window.showTextDocument(document);
                            
                            // Position at the line where the tag is used
                            const position = new vscode.Position(selectedUsage.usage.line - 1, 0);
                            editor.selection = new vscode.Selection(position, position);
                            editor.revealRange(
                                new vscode.Range(position, position),
                                vscode.TextEditorRevealType.InCenter
                            );
                        }
                    }
                } catch (error) {
                    vscode.window.showErrorMessage(`Error finding custom tags: ${error}`);
                }
            });
        })
    );
    
    // Command to open a file when clicking on a class
    context.subscriptions.push(
        vscode.commands.registerCommand('classHierarchy.openFile', (filePath: string) => {
            vscode.workspace.openTextDocument(filePath).then(doc => {
                vscode.window.showTextDocument(doc);
            });
        })
    );
    
    // Command to open a file at a specific line
    context.subscriptions.push(
        vscode.commands.registerCommand('classHierarchy.openFileAtLine', (filePath: string, line: number) => {
            vscode.workspace.openTextDocument(filePath).then(doc => {
                vscode.window.showTextDocument(doc).then(editor => {
                    // Position at the specified line
                    const position = new vscode.Position(line - 1, 0);
                    editor.selection = new vscode.Selection(position, position);
                    editor.revealRange(
                        new vscode.Range(position, position),
                        vscode.TextEditorRevealType.InCenter
                    );
                });
            });
        })
    );
    
    // Context menu command to set a class as main
    context.subscriptions.push(
        vscode.commands.registerCommand('classHierarchy.setAsMainClass', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                return;
            }
            
            // Try to get the selected class name
            const selection = editor.selection;
            const selectedText = editor.document.getText(selection);
            
            // If text is selected, use it as the class name
            if (selectedText) {
                vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: `Building class hierarchy for ${selectedText}...`,
                    cancellable: false
                }, async () => {
                    const rootNode = await classAnalyzer.buildClassHierarchy(selectedText);
                    if (rootNode) {
                        classHierarchyProvider.refresh(rootNode);
                    } else {
                        vscode.window.showErrorMessage(`'${selectedText}' does not appear to be a valid class`);
                    }
                });
            } else {
                // Try to detect the class name from the current file
                const documentText = editor.document.getText();
                const fileName = path.basename(editor.document.fileName);
                
                // For JavaScript files
                if (fileName.endsWith('.js')) {
                    const classMatch = /class\s+(\w+)/.exec(documentText);
                    
                    if (classMatch && classMatch[1]) {
                        vscode.window.withProgress({
                            location: vscode.ProgressLocation.Notification,
                            title: `Building class hierarchy for ${classMatch[1]}...`,
                            cancellable: false
                        }, async () => {
                            const rootNode = await classAnalyzer.buildClassHierarchy(classMatch[1]);
                            if (rootNode) {
                                classHierarchyProvider.refresh(rootNode);
                            } else {
                                // Try using the file name as the class name (for LWC)
                                const componentName = path.basename(editor.document.fileName, '.js');
                                const rootNode = await classAnalyzer.buildClassHierarchy(componentName);
                                if (rootNode) {
                                    classHierarchyProvider.refresh(rootNode);
                                } else {
                                    vscode.window.showErrorMessage('Could not determine class hierarchy');
                                }
                            }
                        });
                    } else {
                        // Try using the file name as the class name (for LWC)
                        const componentName = path.basename(editor.document.fileName, '.js');
                        vscode.window.withProgress({
                            location: vscode.ProgressLocation.Notification,
                            title: `Building class hierarchy for ${componentName}...`,
                            cancellable: false
                        }, async () => {
                            const rootNode = await classAnalyzer.buildClassHierarchy(componentName);
                            if (rootNode) {
                                classHierarchyProvider.refresh(rootNode);
                            } else {
                                vscode.window.showErrorMessage('Could not determine class hierarchy');
                            }
                        });
                    }
                } 
                // For HTML files
                else if (fileName.endsWith('.html')) {
                    // Use the file name as the component name
                    const componentName = path.basename(editor.document.fileName, '.html');
                    vscode.window.withProgress({
                        location: vscode.ProgressLocation.Notification,
                        title: `Building class hierarchy for ${componentName}...`,
                        cancellable: false
                    }, async () => {
                        const rootNode = await classAnalyzer.buildClassHierarchy(componentName);
                        if (rootNode) {
                            classHierarchyProvider.refresh(rootNode);
                        } else {
                            vscode.window.showErrorMessage('Could not determine class hierarchy');
                        }
                    });
                } else {
                    vscode.window.showErrorMessage('Could not detect a class in the current file');
                }
            }
        })
    );
}

export function deactivate() {}