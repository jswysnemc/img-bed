(function() {
    const $ = id => document.getElementById(id);

    // Auth
    const AUTH_KEY = 'imgbed_token';
    let authToken = localStorage.getItem(AUTH_KEY);

    // Elements
    const loginModal = $('loginModal');
    const loginForm = $('loginForm');
    const tokenInput = $('tokenInput');
    const mainContent = $('mainContent');
    const logoutBtn = $('logoutBtn');

    const uploadBox = $('uploadBox');
    const fileInput = $('fileInput');
    const uploadProgress = $('uploadProgress');
    const imageGrid = $('imageGrid');
    const loadMore = $('loadMore');
    const emptyState = $('emptyState');
    const imageCount = $('imageCount');
    const searchInput = $('searchInput');
    const sortSelect = $('sortSelect');
    const refreshBtn = $('refreshBtn');
    const statCount = $('statCount');
    const statSize = $('statSize');
    const toast = $('toast');

    // Settings modal
    const settingsBtn = $('settingsBtn');
    const settingsModal = $('settingsModal');
    const closeSettings = $('closeSettings');
    const toggleToken = $('toggleToken');
    const defaultFormat = $('defaultFormat');
    const saveSettings = $('saveSettings');

    // Image modal
    const imageModal = $('imageModal');
    const closeModal = $('closeModal');
    const modalImage = $('modalImage');
    const infoFilename = $('infoFilename');
    const infoSize = $('infoSize');
    const infoDate = $('infoDate');
    const infoDimensions = $('infoDimensions');
    const infoHash = $('infoHash');
    const urlDirect = $('urlDirect');
    const urlMarkdown = $('urlMarkdown');
    const urlHtml = $('urlHtml');
    const urlBbcode = $('urlBbcode');
    const copyDefault = $('copyDefault');
    const deleteImage = $('deleteImage');

    // Batch selection
    const selectModeBtn = $('selectModeBtn');
    const batchToolbar = $('batchToolbar');
    const selectedCount = $('selectedCount');
    const selectAllBtn = $('selectAllBtn');
    const deselectAllBtn = $('deselectAllBtn');
    const batchDeleteBtn = $('batchDeleteBtn');
    const cancelSelectBtn = $('cancelSelectBtn');

    let allImages = [];
    let filteredImages = [];
    let offset = 0;
    let currentImage = null;
    let uploadQueue = [];
    let selectMode = false;
    let selectedIds = new Set();

    // Storage helpers
    function getToken() {
        return authToken || '';
    }

    function setToken(token) {
        localStorage.setItem('imgbed_token', token);
    }

    function getDefaultFormat() {
        return localStorage.getItem('imgbed_format') || 'url';
    }

    function setDefaultFormat(format) {
        localStorage.setItem('imgbed_format', format);
    }

    // UI helpers
    function showToast(msg, duration = 2000) {
        toast.textContent = msg;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), duration);
    }

    function formatSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    }

    function formatDate(dateStr) {
        const d = new Date(dateStr);
        const now = new Date();
        const diff = now - d;

        if (diff < 60000) return '刚刚';
        if (diff < 3600000) return Math.floor(diff / 60000) + ' 分钟前';
        if (diff < 86400000) return Math.floor(diff / 3600000) + ' 小时前';
        if (diff < 604800000) return Math.floor(diff / 86400000) + ' 天前';

        return d.toLocaleDateString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
    }

    function formatFullDate(dateStr) {
        const d = new Date(dateStr);
        return d.toLocaleString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    // Auth
    async function login(token) {
        try {
            const res = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token })
            });

            const data = await res.json();

            if (res.ok && data.success) {
                authToken = token;
                localStorage.setItem(AUTH_KEY, token);
                loginModal.classList.remove('active');
                mainContent.style.display = 'block';
                init();
                showToast('登录成功');
            } else {
                showToast(data.error || '登录失败，令牌无效');
            }
        } catch (e) {
            showToast('登录失败，请检查网络连接');
        }
    }

    function logout() {
        authToken = null;
        localStorage.removeItem(AUTH_KEY);
        loginModal.classList.add('active');
        mainContent.style.display = 'none';
        showToast('已退出登录');
    }

    function checkAuth() {
        if (authToken) {
            loginModal.classList.remove('active');
            mainContent.style.display = 'block';
            init();
        } else {
            loginModal.classList.add('active');
            mainContent.style.display = 'none';
        }
    }

    // API
    async function loadStats() {
        try {
            const res = await fetch('/api/stats', {
                headers: { 'Authorization': `Bearer ${authToken}` }
            });
            if (res.status === 401) {
                logout();
                return;
            }
            const data = await res.json();
            statCount.textContent = data.count;
            statSize.textContent = formatSize(data.total_size);
        } catch (e) {
            console.error('Failed to load stats:', e);
        }
    }

    async function loadAllImages() {
        try {
            const res = await fetch('/api/images?limit=1000&offset=0', {
                headers: { 'Authorization': `Bearer ${authToken}` }
            });
            if (res.status === 401) {
                logout();
                return;
            }
            allImages = await res.json() || [];
            applyFilters();
        } catch (e) {
            console.error('Failed to load images:', e);
        }
    }

    function applyFilters() {
        let images = [...allImages];

        // Search filter
        const query = searchInput.value.trim().toLowerCase();
        if (query) {
            images = images.filter(img => {
                const name = (img.original_name || img.filename).toLowerCase();
                return name.includes(query) || img.filename.toLowerCase().includes(query);
            });
        }

        // Sort
        const sort = sortSelect.value;
        switch (sort) {
            case 'oldest':
                images.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
                break;
            case 'largest':
                images.sort((a, b) => b.size - a.size);
                break;
            case 'smallest':
                images.sort((a, b) => a.size - b.size);
                break;
            default: // newest
                images.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        }

        filteredImages = images;
        offset = 0;
        renderImages(true);
    }

    function renderImages(reset = false) {
        if (reset) {
            imageGrid.innerHTML = '';
            offset = 0;
        }

        const pageSize = 24;
        const page = filteredImages.slice(offset, offset + pageSize);

        if (filteredImages.length === 0) {
            emptyState.style.display = 'block';
            loadMore.style.display = 'none';
            imageCount.textContent = '';
            return;
        }

        emptyState.style.display = 'none';
        imageCount.textContent = `共 ${filteredImages.length} 张`;

        page.forEach(img => {
            const card = document.createElement('div');
            card.className = 'image-card';
            card.dataset.id = img.id;

            if (selectMode) {
                card.classList.add('select-mode');
                if (selectedIds.has(img.id)) {
                    card.classList.add('selected');
                }
            }

            const displayName = img.original_name || img.filename;

            card.innerHTML = `
                <div class="thumb">
                    <img src="/i/${img.filename}" alt="${displayName}" loading="lazy">
                </div>
                <div class="info">
                    <div class="filename" title="${displayName}">${displayName}</div>
                    <div class="meta">
                        <span>${formatSize(img.size)}</span>
                        <span>${formatDate(img.created_at)}</span>
                    </div>
                </div>
            `;
            card.onclick = () => handleCardClick(img, card);
            imageGrid.appendChild(card);
        });

        offset += page.length;
        loadMore.style.display = offset >= filteredImages.length ? 'none' : 'block';
    }

    function handleCardClick(img, card) {
        if (selectMode) {
            toggleSelection(img.id, card);
        } else {
            openImageModal(img);
        }
    }

    // Selection functions
    function enterSelectMode() {
        selectMode = true;
        selectedIds.clear();
        batchToolbar.style.display = 'flex';
        selectModeBtn.style.display = 'none';
        updateSelectionUI();

        document.querySelectorAll('.image-card').forEach(card => {
            card.classList.add('select-mode');
        });
    }

    function exitSelectMode() {
        selectMode = false;
        selectedIds.clear();
        batchToolbar.style.display = 'none';
        selectModeBtn.style.display = 'inline-flex';

        document.querySelectorAll('.image-card').forEach(card => {
            card.classList.remove('select-mode', 'selected');
        });
    }

    function toggleSelection(id, card) {
        if (selectedIds.has(id)) {
            selectedIds.delete(id);
            card.classList.remove('selected');
        } else {
            selectedIds.add(id);
            card.classList.add('selected');
        }
        updateSelectionUI();
    }

    function updateSelectionUI() {
        selectedCount.textContent = selectedIds.size;
        batchDeleteBtn.disabled = selectedIds.size === 0;
    }

    function selectAll() {
        filteredImages.forEach(img => selectedIds.add(img.id));
        document.querySelectorAll('.image-card').forEach(card => {
            card.classList.add('selected');
        });
        updateSelectionUI();
    }

    function deselectAll() {
        selectedIds.clear();
        document.querySelectorAll('.image-card').forEach(card => {
            card.classList.remove('selected');
        });
        updateSelectionUI();
    }

    async function batchDelete() {
        if (selectedIds.size === 0) return;

        const token = getToken();
        if (!token) {
            showToast('请先配置认证令牌');
            return;
        }

        const count = selectedIds.size;
        if (!confirm(`确定要删除选中的 ${count} 张图片吗？`)) {
            return;
        }

        showToast('正在删除...', 10000);
        let successCount = 0;
        let failCount = 0;

        for (const id of selectedIds) {
            try {
                const res = await fetch('/api/images/' + id, {
                    method: 'DELETE',
                    headers: { 'Authorization': 'Bearer ' + token }
                });

                if (res.ok) {
                    successCount++;
                    allImages = allImages.filter(img => img.id !== id);
                } else {
                    failCount++;
                }
            } catch (e) {
                failCount++;
            }
        }

        selectedIds.clear();
        applyFilters();
        loadStats();
        exitSelectMode();

        if (failCount === 0) {
            showToast(`成功删除 ${successCount} 张图片`);
        } else {
            showToast(`删除完成: ${successCount} 成功, ${failCount} 失败`);
        }
    }

    // Upload
    function addToUploadQueue(file) {
        const id = Date.now() + Math.random();
        uploadQueue.push({ id, file, status: 'pending' });
        renderUploadProgress();
        processUploadQueue();
    }

    function renderUploadProgress() {
        if (uploadQueue.length === 0) {
            uploadProgress.innerHTML = '';
            return;
        }

        uploadProgress.innerHTML = uploadQueue.slice(-5).map(item => `
            <div class="progress-item">
                <span class="name">${item.file.name}</span>
                <span class="status ${item.status}">${
                    item.status === 'pending' ? '等待中...' :
                    item.status === 'uploading' ? '上传中...' :
                    item.status === 'success' ? '已完成' : '失败'
                }</span>
            </div>
        `).join('');
    }

    async function processUploadQueue() {
        const pending = uploadQueue.find(i => i.status === 'pending');
        if (!pending) return;

        const uploading = uploadQueue.find(i => i.status === 'uploading');
        if (uploading) return;

        pending.status = 'uploading';
        renderUploadProgress();

        try {
            await uploadFile(pending.file);
            pending.status = 'success';
        } catch (e) {
            pending.status = 'error';
        }

        renderUploadProgress();

        setTimeout(() => {
            uploadQueue = uploadQueue.filter(i => i.status !== 'success');
            renderUploadProgress();
        }, 2000);

        processUploadQueue();
    }

    async function uploadFile(file) {
        const token = getToken();
        if (!token) {
            showToast('请先在设置中配置认证令牌');
            throw new Error('No token');
        }

        const formData = new FormData();
        formData.append('file', file);

        const res = await fetch('/api/upload', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + token },
            body: formData
        });

        const data = await res.json();

        if (!res.ok) {
            showToast('上传失败: ' + data.error);
            throw new Error(data.error);
        }

        // 检查是否是重复文件
        if (data.duplicate) {
            showToast('⚠️ 文件已存在，返回已有链接', 3000);
        } else {
            showToast('上传成功: ' + data.filename);
        }

        // Add to local list (include hash)
        allImages.unshift({
            id: data.id,
            filename: data.filename,
            original_name: data.original_name,
            hash: data.hash,
            size: data.size,
            created_at: new Date().toISOString()
        });
        applyFilters();
        loadStats();

        return data;
    }

    // Image modal
    function openImageModal(img) {
        currentImage = img;

        const url = window.location.origin + '/i/' + img.filename;
        const displayName = img.original_name || img.filename;

        modalImage.src = url;
        modalImage.onload = function() {
            infoDimensions.textContent = `${this.naturalWidth} x ${this.naturalHeight}`;
        };

        infoFilename.textContent = displayName;
        infoSize.textContent = formatSize(img.size);
        infoDate.textContent = formatFullDate(img.created_at);
        infoHash.textContent = img.hash || 'N/A';

        urlDirect.value = url;
        urlMarkdown.value = `![${displayName}](${url})`;
        urlHtml.value = `<img src="${url}" alt="${displayName}">`;
        urlBbcode.value = `[img]${url}[/img]`;

        imageModal.classList.add('active');
    }

    function getFormattedUrl() {
        if (!currentImage) return '';
        const url = window.location.origin + '/i/' + currentImage.filename;
        const displayName = currentImage.original_name || currentImage.filename;
        const format = getDefaultFormat();

        switch (format) {
            case 'markdown':
                return `![${displayName}](${url})`;
            case 'html':
                return `<img src="${url}" alt="${displayName}">`;
            case 'bbcode':
                return `[img]${url}[/img]`;
            default:
                return url;
        }
    }

    async function deleteCurrentImage() {
        if (!currentImage) return;

        const token = getToken();
        if (!token) {
            showToast('请先配置认证令牌');
            return;
        }

        try {
            const res = await fetch('/api/images/' + currentImage.id, {
                method: 'DELETE',
                headers: { 'Authorization': 'Bearer ' + token }
            });

            if (res.ok) {
                showToast('删除成功');
                imageModal.classList.remove('active');
                allImages = allImages.filter(i => i.id !== currentImage.id);
                applyFilters();
                loadStats();
            } else {
                const data = await res.json();
                showToast('删除失败: ' + data.error);
            }
        } catch (e) {
            showToast('删除失败');
        }
    }

    // Event listeners

    // Upload
    uploadBox.onclick = () => fileInput.click();

    fileInput.onchange = (e) => {
        Array.from(e.target.files).forEach(addToUploadQueue);
        fileInput.value = '';
    };

    uploadBox.ondragover = (e) => {
        e.preventDefault();
        uploadBox.classList.add('dragover');
    };

    uploadBox.ondragleave = () => {
        uploadBox.classList.remove('dragover');
    };

    uploadBox.ondrop = (e) => {
        e.preventDefault();
        uploadBox.classList.remove('dragover');
        Array.from(e.dataTransfer.files).forEach(addToUploadQueue);
    };

    // Paste upload
    document.addEventListener('paste', (e) => {
        const items = e.clipboardData?.items;
        if (!items) return;

        for (const item of items) {
            if (item.type.startsWith('image/')) {
                const file = item.getAsFile();
                if (file) {
                    addToUploadQueue(file);
                }
            }
        }
    });

    // Search and sort
    let searchTimeout;
    searchInput.oninput = () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(applyFilters, 300);
    };

    sortSelect.onchange = applyFilters;
    refreshBtn.onclick = () => {
        loadAllImages();
        loadStats();
        showToast('已刷新');
    };

    loadMore.onclick = () => renderImages();

    // Batch selection
    selectModeBtn.onclick = enterSelectMode;
    cancelSelectBtn.onclick = exitSelectMode;
    selectAllBtn.onclick = selectAll;
    deselectAllBtn.onclick = deselectAll;
    batchDeleteBtn.onclick = batchDelete;

    // Settings modal
    settingsBtn.onclick = () => {
        tokenInput.value = getToken();
        defaultFormat.value = getDefaultFormat();
        settingsModal.classList.add('active');
    };

    closeSettings.onclick = () => settingsModal.classList.remove('active');

    settingsModal.onclick = (e) => {
        if (e.target === settingsModal) settingsModal.classList.remove('active');
    };

    toggleToken.onclick = () => {
        tokenInput.type = tokenInput.type === 'password' ? 'text' : 'password';
    };

    saveSettings.onclick = () => {
        setToken(tokenInput.value);
        setDefaultFormat(defaultFormat.value);
        settingsModal.classList.remove('active');
        showToast('设置已保存');
    };

    // Image modal
    closeModal.onclick = () => imageModal.classList.remove('active');

    imageModal.onclick = (e) => {
        if (e.target === imageModal) imageModal.classList.remove('active');
    };

    // Copy buttons
    document.querySelectorAll('.btn-copy').forEach(btn => {
        btn.onclick = () => {
            const target = $(btn.dataset.target);
            if (target) {
                navigator.clipboard.writeText(target.value);
                showToast('已复制');
            }
        };
    });

    copyDefault.onclick = () => {
        const text = getFormattedUrl();
        navigator.clipboard.writeText(text);
        showToast('已复制');
    };

    deleteImage.onclick = () => {
        if (confirm('确定要删除这张图片吗？')) {
            deleteCurrentImage();
        }
    };

    // Login/Logout
    loginForm.onsubmit = (e) => {
        e.preventDefault();
        const token = tokenInput.value.trim();
        if (token) {
            login(token);
        } else {
            showToast('请输入访问令牌');
        }
    };

    logoutBtn.onclick = () => {
        if (confirm('确定要退出登录吗？')) {
            logout();
        }
    };

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (selectMode) {
                exitSelectMode();
            } else {
                settingsModal.classList.remove('active');
                imageModal.classList.remove('active');
            }
        }
    });

    // Init function
    function init() {
        loadStats();
        loadAllImages();
    }

    // Check auth on load
    checkAuth();
})();
