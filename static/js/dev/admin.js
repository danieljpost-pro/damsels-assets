/**
 * Damsels - Activity Admin Panel (DEVELOPMENT ONLY)
 * 
 * This file is only loaded in development mode.
 * It provides UI for managing activities, categories, and prerequisites.
 */

// =============================================================================
// Admin State
// =============================================================================

const adminState = {
    categories: [],
    activities: [],
    prerequisites: [],
    equipment: [],
    activityEquipment: [],
};

// =============================================================================
// Admin DOM Elements
// =============================================================================

const adminElements = {
    stepAdmin: document.getElementById('step-admin'),
    adminBack: document.getElementById('admin-back'),
    adminTabs: document.querySelectorAll('.admin-tab'),
    adminError: document.getElementById('admin-error'),
    formCategory: document.getElementById('form-category'),
    formActivity: document.getElementById('form-activity'),
    formPrerequisite: document.getElementById('form-prerequisite'),
    formEquipment: document.getElementById('form-equipment'),
    formActivityEquipment: document.getElementById('form-activity-equipment'),
    listCategories: document.getElementById('list-categories'),
    listActivities: document.getElementById('list-activities'),
    listPrerequisites: document.getElementById('list-prerequisites'),
    listEquipment: document.getElementById('list-equipment'),
    listActivityEquipment: document.getElementById('list-activity-equipment'),
    roleActivityAdmin: document.getElementById('role-activity-admin'),
};

// =============================================================================
// Admin Client Methods
// =============================================================================

const adminClient = {
    /**
     * Create a new activity category.
     */
    async createCategory(name, description, displayOrder) {
        console.log('[DEV] Creating category:', name);
        await simulateDelay(200);
        
        const category = {
            id: Date.now(),
            name,
            description,
            display_order: displayOrder,
        };
        
        adminState.categories.push(category);
        return category;
    },
    
    /**
     * Delete a category.
     */
    async deleteCategory(categoryId) {
        console.log('[DEV] Deleting category:', categoryId);
        await simulateDelay(200);
        
        adminState.categories = adminState.categories.filter(c => c.id !== categoryId);
    },
    
    /**
     * Create a new activity or skill.
     */
    async createActivity(categoryId, kind, name, description, instructions, videoUrl, xpRequired, xpReward) {
        console.log('[DEV] Creating', kind + ':', name);
        await simulateDelay(200);
        
        const activity = {
            id: Date.now(),
            category_id: categoryId,
            kind, // 'Skill' or 'Activity'
            name,
            description,
            instructions,
            video_url: videoUrl || null,
            xp_required: xpRequired,
            xp_reward: xpReward,
        };
        
        adminState.activities.push(activity);
        return activity;
    },
    
    /**
     * Delete an activity.
     */
    async deleteActivity(activityId) {
        console.log('[DEV] Deleting activity:', activityId);
        await simulateDelay(200);
        
        adminState.activities = adminState.activities.filter(a => a.id !== activityId);
        adminState.prerequisites = adminState.prerequisites.filter(
            p => p.activity_id !== activityId && p.prerequisite_id !== activityId
        );
    },
    
    /**
     * Add a prerequisite relationship.
     */
    async addPrerequisite(activityId, prerequisiteId) {
        console.log('[DEV] Adding prerequisite:', activityId, 'requires', prerequisiteId);
        await simulateDelay(200);
        
        const prereq = {
            id: Date.now(),
            activity_id: activityId,
            prerequisite_id: prerequisiteId,
        };
        
        adminState.prerequisites.push(prereq);
        return prereq;
    },
    
    /**
     * Remove a prerequisite relationship.
     */
    async removePrerequisite(prereqId) {
        console.log('[DEV] Removing prerequisite:', prereqId);
        await simulateDelay(200);
        
        adminState.prerequisites = adminState.prerequisites.filter(p => p.id !== prereqId);
    },
    
    /**
     * Create a new piece of equipment.
     */
    async createEquipment(name, description) {
        console.log('[DEV] Creating equipment:', name);
        await simulateDelay(200);
        
        const equipment = {
            id: Date.now(),
            name,
            description: description || null,
        };
        
        adminState.equipment.push(equipment);
        return equipment;
    },
    
    /**
     * Delete equipment.
     */
    async deleteEquipment(equipmentId) {
        console.log('[DEV] Deleting equipment:', equipmentId);
        await simulateDelay(200);
        
        adminState.equipment = adminState.equipment.filter(e => e.id !== equipmentId);
        adminState.activityEquipment = adminState.activityEquipment.filter(ae => ae.equipment_id !== equipmentId);
    },
    
    /**
     * Link equipment to an activity.
     */
    async addActivityEquipment(activityId, equipmentId, notes) {
        console.log('[DEV] Linking equipment:', equipmentId, 'to activity:', activityId);
        await simulateDelay(200);
        
        const link = {
            id: Date.now(),
            activity_id: activityId,
            equipment_id: equipmentId,
            notes: notes || null,
        };
        
        adminState.activityEquipment.push(link);
        return link;
    },
    
    /**
     * Remove equipment from an activity.
     */
    async removeActivityEquipment(linkId) {
        console.log('[DEV] Removing activity equipment link:', linkId);
        await simulateDelay(200);
        
        adminState.activityEquipment = adminState.activityEquipment.filter(ae => ae.id !== linkId);
    },
};

function simulateDelay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// =============================================================================
// Admin UI Functions
// =============================================================================

/**
 * Initialize the admin panel.
 */
function initAdminPanel() {
    console.log('🛠️ Admin panel initialized (DEVELOPMENT MODE)');
    
    // Show ActivityAdmin role card
    if (adminElements.roleActivityAdmin) {
        adminElements.roleActivityAdmin.style.display = 'flex';
    }
    
    // Add dev mode class to body
    document.body.classList.add('dev-mode');
    
    // Set up admin event listeners
    setupAdminEventListeners();
}

/**
 * Set up admin-specific event listeners.
 */
function setupAdminEventListeners() {
    // Back button
    if (adminElements.adminBack) {
        adminElements.adminBack.addEventListener('click', () => {
            window.showStep('room');
        });
    }
    
    // Tab switching
    adminElements.adminTabs.forEach(tab => {
        tab.addEventListener('click', () => handleAdminTab(tab));
    });
    
    // Forms
    if (adminElements.formCategory) {
        adminElements.formCategory.addEventListener('submit', handleCreateCategory);
    }
    if (adminElements.formActivity) {
        adminElements.formActivity.addEventListener('submit', handleCreateActivity);
    }
    if (adminElements.formPrerequisite) {
        adminElements.formPrerequisite.addEventListener('submit', handleAddPrerequisite);
    }
    if (adminElements.formEquipment) {
        adminElements.formEquipment.addEventListener('submit', handleCreateEquipment);
    }
    if (adminElements.formActivityEquipment) {
        adminElements.formActivityEquipment.addEventListener('submit', handleAddActivityEquipment);
    }
}

/**
 * Handle admin tab switching.
 */
function handleAdminTab(tab) {
    const tabName = tab.dataset.tab;
    
    // Update tab buttons
    adminElements.adminTabs.forEach(t => t.classList.remove('admin-tab--active'));
    tab.classList.add('admin-tab--active');
    
    // Show corresponding content
    document.querySelectorAll('.admin-content').forEach(content => {
        content.classList.add('admin-content--hidden');
    });
    document.getElementById(`tab-${tabName}`).classList.remove('admin-content--hidden');
}

/**
 * Show the admin panel and refresh lists.
 */
function showAdminPanel() {
    window.showStep('admin');
    refreshAdminLists();
}

/**
 * Refresh all admin lists.
 */
function refreshAdminLists() {
    renderCategoryList();
    renderActivityList();
    renderPrerequisiteList();
    renderEquipmentList();
    renderActivityEquipmentList();
    updateCategorySelects();
    updateActivitySelects();
    updateEquipmentSelects();
}

/**
 * Render category list.
 */
function renderCategoryList() {
    const list = adminElements.listCategories;
    if (!list) return;
    
    if (adminState.categories.length === 0) {
        list.innerHTML = '<p class="admin-list__empty">No categories yet</p>';
        return;
    }
    
    list.innerHTML = adminState.categories
        .sort((a, b) => a.display_order - b.display_order)
        .map(cat => `
            <div class="admin-item" data-id="${cat.id}">
                <div class="admin-item__info">
                    <span class="admin-item__name">${escapeHtml(cat.name)}</span>
                    <span class="admin-item__meta">${escapeHtml(cat.description)}</span>
                </div>
                <button class="admin-item__delete" onclick="window.adminDeleteCategory(${cat.id})">×</button>
            </div>
        `).join('');
}

/**
 * Render activity list.
 */
function renderActivityList() {
    const list = adminElements.listActivities;
    if (!list) return;
    
    if (adminState.activities.length === 0) {
        list.innerHTML = '<p class="admin-list__empty">No activities yet</p>';
        return;
    }
    
    list.innerHTML = adminState.activities.map(act => {
        const category = adminState.categories.find(c => c.id === act.category_id);
        const kindBadge = act.kind === 'Skill' 
            ? '<span class="admin-badge admin-badge--skill">SKILL</span>' 
            : '<span class="admin-badge admin-badge--activity">ACTIVITY</span>';
        return `
            <div class="admin-item" data-id="${act.id}">
                <div class="admin-item__info">
                    <span class="admin-item__name">${kindBadge} ${escapeHtml(act.name)}</span>
                    <span class="admin-item__meta">
                        ${category ? escapeHtml(category.name) : 'Unknown'} · 
                        ${act.xp_required} XP req · 
                        ${act.xp_reward} XP reward
                    </span>
                </div>
                <button class="admin-item__delete" onclick="window.adminDeleteActivity(${act.id})">×</button>
            </div>
        `;
    }).join('');
}

/**
 * Render prerequisite list.
 */
function renderPrerequisiteList() {
    const list = adminElements.listPrerequisites;
    if (!list) return;
    
    if (adminState.prerequisites.length === 0) {
        list.innerHTML = '<p class="admin-list__empty">No prerequisites yet</p>';
        return;
    }
    
    list.innerHTML = adminState.prerequisites.map(prereq => {
        const activity = adminState.activities.find(a => a.id === prereq.activity_id);
        const prerequisite = adminState.activities.find(a => a.id === prereq.prerequisite_id);
        const prereqKind = prerequisite?.kind === 'Skill' ? '(Skill)' : '(Activity)';
        return `
            <div class="admin-item" data-id="${prereq.id}">
                <div class="admin-item__info">
                    <span class="admin-item__name">
                        ${activity ? escapeHtml(activity.name) : 'Unknown'}
                    </span>
                    <span class="admin-item__meta">
                        requires → ${prerequisite ? escapeHtml(prerequisite.name) : 'Unknown'} ${prereqKind}
                    </span>
                </div>
                <button class="admin-item__delete" onclick="window.adminDeletePrerequisite(${prereq.id})">×</button>
            </div>
        `;
    }).join('');
}

/**
 * Update category select dropdowns.
 */
function updateCategorySelects() {
    const select = adminElements.formActivity?.querySelector('select[name="category_id"]');
    if (!select) return;
    
    const options = adminState.categories
        .sort((a, b) => a.display_order - b.display_order)
        .map(cat => `<option value="${cat.id}">${escapeHtml(cat.name)}</option>`)
        .join('');
    
    select.innerHTML = '<option value="">Select category...</option>' + options;
}

/**
 * Update activity select dropdowns.
 */
function updateActivitySelects() {
    const activitySelect = document.getElementById('prereq-activity');
    const prereqSelect = document.getElementById('prereq-prereq');
    const equipActivitySelect = document.getElementById('equip-activity');
    
    const options = adminState.activities
        .map(act => `<option value="${act.id}">${escapeHtml(act.name)}</option>`)
        .join('');
    
    if (activitySelect) {
        activitySelect.innerHTML = '<option value="">Select activity...</option>' + options;
    }
    if (prereqSelect) {
        prereqSelect.innerHTML = '<option value="">Select prerequisite...</option>' + options;
    }
    if (equipActivitySelect) {
        equipActivitySelect.innerHTML = '<option value="">Select activity...</option>' + options;
    }
}

/**
 * Render equipment list.
 */
function renderEquipmentList() {
    const list = adminElements.listEquipment;
    if (!list) return;
    
    if (adminState.equipment.length === 0) {
        list.innerHTML = '<p class="admin-list__empty">No equipment yet</p>';
        return;
    }
    
    list.innerHTML = adminState.equipment.map(equip => `
        <div class="admin-item" data-id="${equip.id}">
            <div class="admin-item__info">
                <span class="admin-item__name">🔧 ${escapeHtml(equip.name)}</span>
                ${equip.description ? `<span class="admin-item__meta">${escapeHtml(equip.description)}</span>` : ''}
            </div>
            <button class="admin-item__delete" onclick="window.adminDeleteEquipment(${equip.id})">×</button>
        </div>
    `).join('');
}

/**
 * Render activity equipment links list.
 */
function renderActivityEquipmentList() {
    const list = adminElements.listActivityEquipment;
    if (!list) return;
    
    if (adminState.activityEquipment.length === 0) {
        list.innerHTML = '<p class="admin-list__empty">No equipment linked yet</p>';
        return;
    }
    
    list.innerHTML = adminState.activityEquipment.map(link => {
        const activity = adminState.activities.find(a => a.id === link.activity_id);
        const equipment = adminState.equipment.find(e => e.id === link.equipment_id);
        return `
            <div class="admin-item" data-id="${link.id}">
                <div class="admin-item__info">
                    <span class="admin-item__name">
                        ${activity ? escapeHtml(activity.name) : 'Unknown'}
                    </span>
                    <span class="admin-item__meta">
                        needs → 🔧 ${equipment ? escapeHtml(equipment.name) : 'Unknown'}
                        ${link.notes ? `(${escapeHtml(link.notes)})` : ''}
                    </span>
                </div>
                <button class="admin-item__delete" onclick="window.adminRemoveActivityEquipment(${link.id})">×</button>
            </div>
        `;
    }).join('');
}

/**
 * Update equipment select dropdowns.
 */
function updateEquipmentSelects() {
    const equipSelect = document.getElementById('equip-equipment');
    if (!equipSelect) return;
    
    const options = adminState.equipment
        .map(e => `<option value="${e.id}">${escapeHtml(e.name)}</option>`)
        .join('');
    
    equipSelect.innerHTML = '<option value="">Select equipment...</option>' + options;
}

/**
 * Handle category creation.
 */
async function handleCreateCategory(e) {
    e.preventDefault();
    
    const form = e.target;
    const formData = new FormData(form);
    
    try {
        await adminClient.createCategory(
            formData.get('name'),
            formData.get('description'),
            parseInt(formData.get('display_order')) || 0
        );
        
        form.reset();
        refreshAdminLists();
        
    } catch (error) {
        showAdminError(error.message);
    }
}

/**
 * Handle activity creation.
 */
async function handleCreateActivity(e) {
    e.preventDefault();
    
    const form = e.target;
    const formData = new FormData(form);
    
    const categoryId = parseInt(formData.get('category_id'));
    if (!categoryId) {
        showAdminError('Please select a category');
        return;
    }
    
    const kind = formData.get('kind') || 'Activity';
    
    try {
        await adminClient.createActivity(
            categoryId,
            kind,
            formData.get('name'),
            formData.get('description'),
            formData.get('instructions'),
            formData.get('video_url') || null,
            parseInt(formData.get('xp_required')) || 0,
            parseInt(formData.get('xp_reward')) || 10
        );
        
        form.reset();
        refreshAdminLists();
        
    } catch (error) {
        showAdminError(error.message);
    }
}

/**
 * Handle prerequisite addition.
 */
async function handleAddPrerequisite(e) {
    e.preventDefault();
    
    const form = e.target;
    const formData = new FormData(form);
    
    const activityId = parseInt(formData.get('activity_id'));
    const prerequisiteId = parseInt(formData.get('prerequisite_id'));
    
    if (!activityId || !prerequisiteId) {
        showAdminError('Please select both activities');
        return;
    }
    
    if (activityId === prerequisiteId) {
        showAdminError('Activity cannot be its own prerequisite');
        return;
    }
    
    try {
        await adminClient.addPrerequisite(activityId, prerequisiteId);
        
        form.reset();
        refreshAdminLists();
        
    } catch (error) {
        showAdminError(error.message);
    }
}

/**
 * Handle equipment creation.
 */
async function handleCreateEquipment(e) {
    e.preventDefault();
    
    const form = e.target;
    const formData = new FormData(form);
    
    try {
        await adminClient.createEquipment(
            formData.get('name'),
            formData.get('description') || null
        );
        
        form.reset();
        refreshAdminLists();
        
    } catch (error) {
        showAdminError(error.message);
    }
}

/**
 * Handle linking equipment to activity.
 */
async function handleAddActivityEquipment(e) {
    e.preventDefault();
    
    const form = e.target;
    const formData = new FormData(form);
    
    const activityId = parseInt(formData.get('activity_id'));
    const equipmentId = parseInt(formData.get('equipment_id'));
    
    if (!activityId || !equipmentId) {
        showAdminError('Please select both activity and equipment');
        return;
    }
    
    // Check if already linked
    const existing = adminState.activityEquipment.find(
        ae => ae.activity_id === activityId && ae.equipment_id === equipmentId
    );
    if (existing) {
        showAdminError('Activity already has this equipment');
        return;
    }
    
    try {
        await adminClient.addActivityEquipment(
            activityId,
            equipmentId,
            formData.get('notes') || null
        );
        
        form.reset();
        refreshAdminLists();
        
    } catch (error) {
        showAdminError(error.message);
    }
}

/**
 * Show admin error message.
 */
function showAdminError(message) {
    const errorEl = adminElements.adminError;
    if (!errorEl) return;
    
    errorEl.textContent = message;
    errorEl.classList.add('login-form__error--visible');
    
    setTimeout(() => {
        errorEl.classList.remove('login-form__error--visible');
    }, 5000);
}

/**
 * Escape HTML to prevent XSS.
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// =============================================================================
// Global Admin Functions (called from onclick)
// =============================================================================

window.adminDeleteCategory = async function(id) {
    const hasActivities = adminState.activities.some(a => a.category_id === id);
    if (hasActivities) {
        showAdminError('Cannot delete category with activities');
        return;
    }
    
    await adminClient.deleteCategory(id);
    refreshAdminLists();
};

window.adminDeleteActivity = async function(id) {
    await adminClient.deleteActivity(id);
    refreshAdminLists();
};

window.adminDeletePrerequisite = async function(id) {
    await adminClient.removePrerequisite(id);
    refreshAdminLists();
};

window.adminDeleteEquipment = async function(id) {
    // Check if any activities use this equipment
    const hasLinks = adminState.activityEquipment.some(ae => ae.equipment_id === id);
    if (hasLinks) {
        showAdminError('Cannot delete equipment that is linked to activities');
        return;
    }
    
    await adminClient.deleteEquipment(id);
    refreshAdminLists();
};

window.adminRemoveActivityEquipment = async function(id) {
    await adminClient.removeActivityEquipment(id);
    refreshAdminLists();
};

// Export for main app
window.showAdminPanel = showAdminPanel;
window.initAdminPanel = initAdminPanel;

// =============================================================================
// Auto-initialize when DOM is ready
// =============================================================================

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAdminPanel);
} else {
    initAdminPanel();
}

