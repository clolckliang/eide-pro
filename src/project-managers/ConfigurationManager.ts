/*
    MIT License

    Copyright (c) 2019 github0null

    Permission is hereby granted, free of charge, to any person obtaining a copy
    of this software and associated documentation files (the "Software"), to deal
    in the Software without restriction, including without limitation the rights
    to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
    copies of the Software, and to permit persons to whom the Software is
    furnished to do so, subject to the following conditions:

    The above copyright notice and this permission notice shall be included in all
    copies or substantial portions of the Software.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
    AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
    LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
    OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
    SOFTWARE.
*/

import * as fs from 'fs';
import * as NodePath from 'path';
import { File } from '../../lib/node-utility/File';
import { AbstractProject } from '../EIDEProject';
import {
    ProjectConfigData, ProjectConfiguration, ProjectType, BuilderConfigData,
    EIDE_CONF_VERSION
} from '../EIDETypeDefine';
import { GlobalEvent } from '../GlobalEvents';

/**
 * Configuration manager for EIDE projects
 *
 * Handles loading, saving, validating, and migrating project configurations
 */
export class ConfigurationManager {

    private project: AbstractProject;
    private configCache: ProjectConfigData<any> | null = null;

    /**
     * Constructor
     * @param project - The project instance
     */
    constructor(project: AbstractProject) {
        this.project = project;
    }

    /**
     * Get project configuration
     * @returns Project configuration data
     */
    getConfiguration(): ProjectConfiguration {
        if (!this.configCache) {
            this.loadConfig();
        }
        return this.configCache!;
    }

    /**
     * Load project configuration from file
     * @returns Loaded configuration or null
     */
    loadConfig(): ProjectConfigData<any> | null {
        try {
            const configFile = this.project.getConfigFile();
            if (!configFile.exists()) {
                GlobalEvent.log_error(`Config file not found: ${configFile.path}`);
                return null;
            }

            const content = configFile.read();
            const config = JSON.parse(content) as ProjectConfigData<any>;

            // Validate version
            if (config.version !== EIDE_CONF_VERSION) {
                this.migrateConfig(config);
            }

            this.configCache = config;
            return config;

        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            GlobalEvent.log_error(`Failed to load config: ${err.message}`);
            return null;
        }
    }

    /**
     * Save project configuration to file
     * @returns True if saved successfully
     */
    saveConfig(): boolean {
        try {
            if (!this.configCache) {
                GlobalEvent.log_warn('No configuration to save');
                return false;
            }

            const configFile = this.project.getConfigFile();
            const content = JSON.stringify(this.configCache, null, 4);

            // Ensure directory exists
            const dir = NodePath.dirname(configFile.path);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            fs.writeFileSync(configFile.path, content, 'utf-8');
            return true;

        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            GlobalEvent.log_error(`Failed to save config: ${err.message}`);
            return false;
        }
    }

    /**
     * Validate configuration
     * @param config - Configuration to validate
     * @returns Object with success status and error message
     */
    validateConfig(config: ProjectConfigData<any>): { valid: boolean, error?: string } {
        try {
            // Check required fields
            if (!config.name) {
                return { valid: false, error: 'Project name is required' };
            }

            if (!config.type) {
                return { valid: false, error: 'Project type is required' };
            }

            if (!config.compiler) {
                return { valid: false, error: 'Compiler configuration is required' };
            }

            // Validate project type
            const validTypes = [ProjectType.C51, ProjectType.ARM, ProjectType.RISCV, ProjectType.MCS51];
            if (!validTypes.includes(config.type)) {
                return { valid: false, error: `Invalid project type: ${config.type}` };
            }

            return { valid: true };

        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            return { valid: false, error: err.message };
        }
    }

    /**
     * Migrate configuration to latest version
     * @param config - Configuration to migrate
     * @returns Migrated configuration
     */
    migrateConfig(config: ProjectConfigData<any>): ProjectConfigData<any> {
        try {
            const currentVersion = config.version || 1;

            // Migration logic for different versions
            if (currentVersion < EIDE_CONF_VERSION) {
                GlobalEvent.log_info(`Migrating config from version ${currentVersion} to ${EIDE_CONF_VERSION}`);

                // Add version-specific migrations here
                if (currentVersion < 2) {
                    // Migrate to version 2
                    config = this.migrateToV2(config);
                }

                // Update version
                config.version = EIDE_CONF_VERSION;

                // Save migrated config
                this.saveConfig();
            }

            return config;

        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            GlobalEvent.log_error(`Config migration failed: ${err.message}`);
            return config;
        }
    }

    /**
     * Internal: Migrate configuration to version 2
     * @param config - Old configuration
     * @returns Migrated configuration
     */
    private migrateToV2(config: any): ProjectConfigData<any> {
        // Implement version 2 migration logic
        // For now, just return the config as-is
        return config;
    }

    /**
     * Update configuration
     * @param updates - Partial configuration updates
     * @returns True if updated successfully
     */
    updateConfig(updates: Partial<ProjectConfigData<any>>): boolean {
        try {
            if (!this.configCache) {
                this.loadConfig();
            }

            if (!this.configCache) {
                return false;
            }

            // Merge updates
            Object.assign(this.configCache, updates);

            // Validate
            const validation = this.validateConfig(this.configCache);
            if (!validation.valid) {
                GlobalEvent.log_error(`Invalid config: ${validation.error}`);
                return false;
            }

            // Save
            return this.saveConfig();

        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            GlobalEvent.log_error(`Failed to update config: ${err.message}`);
            return false;
        }
    }

    /**
     * Reload configuration from file
     * @returns True if reloaded successfully
     */
    reloadConfig(): boolean {
        this.configCache = null;
        return this.loadConfig() !== null;
    }

    /**
     * Clear configuration cache
     */
    clearCache(): void {
        this.configCache = null;
    }

    /**
     * Get configuration value by key
     * @param key - Configuration key (supports dot notation)
     * @returns Configuration value or undefined
     */
    getValue(key: string): any {
        if (!this.configCache) {
            this.loadConfig();
        }

        if (!this.configCache) {
            return undefined;
        }

        // Support dot notation for nested keys
        const keys = key.split('.');
        let value: any = this.configCache;

        for (const k of keys) {
            if (value && typeof value === 'object') {
                value = value[k];
            } else {
                return undefined;
            }
        }

        return value;
    }

    /**
     * Set configuration value by key
     * @param key - Configuration key (supports dot notation)
     * @param value - Value to set
     * @returns True if set successfully
     */
    setValue(key: string, value: any): boolean {
        if (!this.configCache) {
            this.loadConfig();
        }

        if (!this.configCache) {
            return false;
        }

        // Support dot notation for nested keys
        const keys = key.split('.');
        const lastKey = keys.pop()!;
        let obj: any = this.configCache;

        for (const k of keys) {
            if (!(k in obj)) {
                obj[k] = {};
            }
            obj = obj[k];
        }

        obj[lastKey] = value;
        return this.saveConfig();
    }
}
