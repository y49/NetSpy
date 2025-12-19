// ==========================================
// NetSpy - Tab Panel Component
// 可复用的 Tab 面板组件
// ==========================================

/**
 * TabPanel 组件
 * 简洁的 Tab 切换面板
 */
export class TabPanel {
    /**
     * @param {HTMLElement} container - 容器元素
     * @param {Object} options - 配置选项
     */
    constructor(container, options = {}) {
        this.container = container;
        this.options = {
            tabs: [], // { id, label, badge?, icon? }
            activeTab: null,
            position: 'top', // 'top' | 'bottom'
            ...options
        };

        this.activeTabId = this.options.activeTab || (this.options.tabs[0]?.id);
        this.tabContents = new Map();
        this.onTabChangeCallbacks = [];

        this.render();
    }

    /**
     * 设置 tabs 配置
     */
    setTabs(tabs) {
        this.options.tabs = tabs;
        if (!tabs.find(t => t.id === this.activeTabId)) {
            this.activeTabId = tabs[0]?.id;
        }
        this.render();
    }

    /**
     * 获取当前激活的 tab
     */
    getActiveTab() {
        return this.activeTabId;
    }

    /**
     * 切换到指定 tab
     */
    switchTo(tabId) {
        if (this.activeTabId === tabId) return;

        const tab = this.options.tabs.find(t => t.id === tabId);
        if (!tab) return;

        this.activeTabId = tabId;
        this._updateActiveState();
        this._triggerChange(tabId);
    }

    /**
     * 更新 tab badge
     */
    setBadge(tabId, badge) {
        const tab = this.options.tabs.find(t => t.id === tabId);
        if (tab) {
            tab.badge = badge;
            this._updateBadge(tabId, badge);
        }
    }

    /**
     * 获取 tab 内容容器
     */
    getContentContainer(tabId) {
        return this.tabContents.get(tabId);
    }

    /**
     * 设置 tab 内容
     */
    setContent(tabId, content) {
        const container = this.tabContents.get(tabId);
        if (container) {
            if (typeof content === 'string') {
                container.innerHTML = content;
            } else if (content instanceof HTMLElement) {
                container.innerHTML = '';
                container.appendChild(content);
            }
        }
    }

    /**
     * 监听 tab 变化
     */
    onTabChange(callback) {
        this.onTabChangeCallbacks.push(callback);
        return () => {
            this.onTabChangeCallbacks = this.onTabChangeCallbacks.filter(cb => cb !== callback);
        };
    }

    /**
     * 渲染组件
     */
    render() {
        this.container.innerHTML = '';
        this.container.className = `tab-panel tab-${this.options.position}`;

        // Tab 头部
        this.tabHeader = document.createElement('div');
        this.tabHeader.className = 'tab-header';

        this.options.tabs.forEach(tab => {
            const tabBtn = document.createElement('button');
            tabBtn.className = 'tab-btn';
            tabBtn.dataset.tabId = tab.id;

            if (tab.id === this.activeTabId) {
                tabBtn.classList.add('active');
            }

            // 图标
            if (tab.icon) {
                const icon = document.createElement('span');
                icon.className = 'tab-icon';
                icon.innerHTML = tab.icon;
                tabBtn.appendChild(icon);
            }

            // 标签
            const label = document.createElement('span');
            label.className = 'tab-label';
            label.textContent = tab.label;
            tabBtn.appendChild(label);

            // 徽章
            if (tab.badge !== undefined && tab.badge !== null) {
                const badge = document.createElement('span');
                badge.className = 'tab-badge';
                badge.textContent = tab.badge;
                tabBtn.appendChild(badge);
            }

            tabBtn.addEventListener('click', () => this.switchTo(tab.id));
            this.tabHeader.appendChild(tabBtn);
        });

        // 内容区
        this.tabBody = document.createElement('div');
        this.tabBody.className = 'tab-body';

        this.tabContents.clear();
        this.options.tabs.forEach(tab => {
            const pane = document.createElement('div');
            pane.className = 'tab-pane';
            pane.dataset.tabId = tab.id;

            if (tab.id === this.activeTabId) {
                pane.classList.add('active');
            }

            this.tabContents.set(tab.id, pane);
            this.tabBody.appendChild(pane);
        });

        // 根据位置决定顺序
        if (this.options.position === 'bottom') {
            this.container.appendChild(this.tabBody);
            this.container.appendChild(this.tabHeader);
        } else {
            this.container.appendChild(this.tabHeader);
            this.container.appendChild(this.tabBody);
        }
    }

    /**
     * 更新激活状态
     */
    _updateActiveState() {
        // 更新 tab 按钮
        this.tabHeader.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tabId === this.activeTabId);
        });

        // 更新内容面板
        this.tabBody.querySelectorAll('.tab-pane').forEach(pane => {
            pane.classList.toggle('active', pane.dataset.tabId === this.activeTabId);
        });
    }

    /**
     * 更新徽章
     */
    _updateBadge(tabId, badge) {
        const tabBtn = this.tabHeader.querySelector(`[data-tab-id="${tabId}"]`);
        if (!tabBtn) return;

        let badgeEl = tabBtn.querySelector('.tab-badge');

        if (badge === undefined || badge === null || badge === 0) {
            if (badgeEl) badgeEl.remove();
        } else {
            if (!badgeEl) {
                badgeEl = document.createElement('span');
                badgeEl.className = 'tab-badge';
                tabBtn.appendChild(badgeEl);
            }
            badgeEl.textContent = badge;
        }
    }

    /**
     * 触发变化事件
     */
    _triggerChange(tabId) {
        this.onTabChangeCallbacks.forEach(cb => cb(tabId));
    }

    /**
     * 销毁组件
     */
    destroy() {
        this.container.innerHTML = '';
        this.tabContents.clear();
        this.onTabChangeCallbacks = [];
    }
}

// CSS 样式
export const TabPanelStyles = `
.tab-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
}

.tab-panel.tab-bottom {
    flex-direction: column-reverse;
}

.tab-header {
    display: flex;
    gap: 2px;
    padding: 0 8px;
    background: var(--bg-panel);
    border-bottom: 1px solid var(--border-light);
    flex-shrink: 0;
    overflow-x: auto;
}

.tab-bottom .tab-header {
    border-bottom: none;
    border-top: 1px solid var(--border-light);
}

.tab-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 10px 16px;
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    font-size: 12px;
    font-weight: 500;
    color: var(--text-secondary);
    cursor: pointer;
    transition: var(--transition-fast);
    white-space: nowrap;
}

.tab-btn:hover {
    color: var(--text-primary);
    background: var(--bg-hover);
}

.tab-btn.active {
    color: var(--accent-primary);
    border-bottom-color: var(--accent-primary);
}

.tab-icon {
    display: flex;
    align-items: center;
}

.tab-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 18px;
    height: 18px;
    padding: 0 6px;
    background: var(--accent-primary);
    border-radius: 9px;
    font-size: 10px;
    font-weight: 600;
    color: white;
}

.tab-body {
    flex: 1;
    overflow: hidden;
}

.tab-pane {
    display: none;
    height: 100%;
    overflow: auto;
}

.tab-pane.active {
    display: block;
}
`;
