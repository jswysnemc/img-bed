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
    const uploadPanel = $('uploadPanel');
    const closeUploadPanel = $('closeUploadPanel');
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
    const settingsTokenInput = $('settingsTokenInput');
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
    const viewImage = $('viewImage');

    // Image viewer
    const imageViewer = $('imageViewer');
    const viewerImage = $('viewerImage');
    const viewerContainer = imageViewer ? imageViewer.querySelector('.viewer-container') : null;
    const viewerZoomIn = $('viewerZoomIn');
    const viewerZoomOut = $('viewerZoomOut');
    const viewerRotateLeft = $('viewerRotateLeft');
    const viewerRotateRight = $('viewerRotateRight');
    const viewerReset = $('viewerReset');
    const viewerClose = $('viewerClose');

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

    // Image viewer state
    let viewerState = {
        scale: 1,
        rotation: 0,
        translateX: 0,
        translateY: 0,
        isDragging: false,
        startX: 0,
        startY: 0
    };

    // Storage helpers
    function getToken() {
        return authToken || '';
    }

    function getDefaultFormat() {
        return localStorage.getItem('imgbed_format') || 'url';
    }

    // UI helpers
    function showToast(msg, duration = 2000) {
        toast.textContent = msg;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), duration);
    }

    // Custom confirm dialog
    function showConfirm(message, title = '确认操作') {
        return new Promise((resolve) => {
            const confirmModal = $('confirmModal');
            const confirmTitle = $('confirmTitle');
            const confirmMessage = $('confirmMessage');
            const confirmOk = $('confirmOk');
            const confirmCancel = $('confirmCancel');

            confirmTitle.textContent = title;
            confirmMessage.textContent = message;
            confirmModal.classList.add('active');

            const handleOk = () => {
                confirmModal.classList.remove('active');
                cleanup();
                resolve(true);
            };

            const handleCancel = () => {
                confirmModal.classList.remove('active');
                cleanup();
                resolve(false);
            };

            const cleanup = () => {
                confirmOk.removeEventListener('click', handleOk);
                confirmCancel.removeEventListener('click', handleCancel);
                confirmModal.removeEventListener('click', handleModalClick);
            };

            const handleModalClick = (e) => {
                if (e.target === confirmModal) {
                    handleCancel();
                }
            };

            confirmOk.addEventListener('click', handleOk);
            confirmCancel.addEventListener('click', handleCancel);
            confirmModal.addEventListener('click', handleModalClick);
        });
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

    async function loadServerConfig() {
        try {
            const res = await fetch('/api/config');
            const data = await res.json();

            console.log('Loaded server config:', data);

            const compressionCheckbox = $('configCompression');
            compressionCheckbox.checked = data.compression_enabled;
            $('configMaxWidth').value = data.max_width;
            $('configJpegQuality').value = data.jpeg_quality;
            $('configMaxSize').value = Math.round(data.max_size / (1024 * 1024)); // Convert bytes to MB

            console.log('Compression checkbox set to:', compressionCheckbox.checked);
        } catch (e) {
            console.error('Failed to load config:', e);
            showToast('加载配置失败');
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
                    <div class="quick-actions">
                        <button class="quick-action-btn" data-action="copy-url" title="复制直链">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
                            </svg>
                        </button>
                        <button class="quick-action-btn" data-action="copy-markdown" title="复制 Markdown">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2Z"></path>
                                <path d="M7 15V9l2 2 2-2v6m4-2 2 2 2-2"></path>
                            </svg>
                        </button>
                        <button class="quick-action-btn" data-action="copy-html" title="复制 HTML">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="m18 16 4-4-4-4"></path>
                                <path d="m6 8-4 4 4 4"></path>
                                <path d="m14.5 4-5 16"></path>
                            </svg>
                        </button>
                        <button class="quick-action-btn quick-action-delete" data-action="delete" title="删除">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M3 6h18"></path>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            </svg>
                        </button>
                    </div>
                </div>
                <div class="info">
                    <div class="filename" title="${displayName}">${displayName}</div>
                    <div class="meta">
                        <span>${formatSize(img.size)}</span>
                        <span>${formatDate(img.created_at)}</span>
                    </div>
                </div>
            `;

            // Handle card click
            card.onclick = () => handleCardClick(img, card);

            // Handle quick action clicks
            const quickActions = card.querySelectorAll('.quick-action-btn');
            quickActions.forEach(btn => {
                btn.onclick = (e) => {
                    e.stopPropagation();
                    handleQuickAction(btn.dataset.action, img);
                };
            });
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

    // Quick action handler
    async function handleQuickAction(action, img) {
        const url = window.location.origin + '/i/' + img.filename;
        const displayName = img.original_name || img.filename;

        switch (action) {
            case 'copy-url':
                navigator.clipboard.writeText(url);
                showToast('已复制直链');
                break;

            case 'copy-markdown':
                const markdown = `![${displayName}](${url})`;
                navigator.clipboard.writeText(markdown);
                showToast('已复制 Markdown');
                break;

            case 'copy-html':
                const html = `<img src="${url}" alt="${displayName}">`;
                navigator.clipboard.writeText(html);
                showToast('已复制 HTML');
                break;

            case 'delete':
                if (await showConfirm('确定要删除这张图片吗？', '删除图片')) {
                    const token = getToken();
                    if (!token) {
                        showToast('请先配置认证令牌');
                        return;
                    }

                    try {
                        const res = await fetch('/api/images/' + img.id, {
                            method: 'DELETE',
                            headers: { 'Authorization': 'Bearer ' + token }
                        });

                        if (res.ok) {
                            showToast('删除成功');
                            allImages = allImages.filter(i => i.id !== img.id);
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
                break;
        }
    }

    // Image viewer functions
    function openImageViewer() {
        if (!currentImage) return;

        const url = window.location.origin + '/i/' + currentImage.filename;
        viewerImage.src = url;
        imageViewer.classList.add('active');
        resetViewerState();
        updateViewerTransform();
    }

    function closeImageViewer() {
        imageViewer.classList.remove('active');
        viewerImage.src = '';
    }

    function resetViewerState() {
        viewerState.scale = 1;
        viewerState.rotation = 0;
        viewerState.translateX = 0;
        viewerState.translateY = 0;
    }

    function updateViewerTransform() {
        viewerImage.style.transform = `translate(${viewerState.translateX}px, ${viewerState.translateY}px) scale(${viewerState.scale}) rotate(${viewerState.rotation}deg)`;
    }

    function zoomIn() {
        viewerState.scale = Math.min(viewerState.scale + 0.25, 5);
        updateViewerTransform();
    }

    function zoomOut() {
        viewerState.scale = Math.max(viewerState.scale - 0.25, 0.25);
        updateViewerTransform();
    }

    function rotateLeft() {
        viewerState.rotation -= 90;
        updateViewerTransform();
    }

    function rotateRight() {
        viewerState.rotation += 90;
        updateViewerTransform();
    }

    function resetViewer() {
        resetViewerState();
        updateViewerTransform();
    }

    // Image viewer event listeners
    viewImage.onclick = openImageViewer;
    viewerClose.onclick = closeImageViewer;
    viewerZoomIn.onclick = zoomIn;
    viewerZoomOut.onclick = zoomOut;
    viewerRotateLeft.onclick = rotateLeft;
    viewerRotateRight.onclick = rotateRight;
    viewerReset.onclick = resetViewer;

    // Keyboard shortcuts for viewer
    imageViewer.onclick = (e) => {
        if (e.target === imageViewer || e.target === viewerImage) {
            closeImageViewer();
        }
    };

    // Drag support
    viewerImage.onmousedown = (e) => {
        e.preventDefault();
        viewerState.isDragging = true;
        viewerState.startX = e.clientX - viewerState.translateX;
        viewerState.startY = e.clientY - viewerState.translateY;
        viewerImage.style.cursor = 'grabbing';
    };

    document.onmousemove = (e) => {
        if (viewerState.isDragging) {
            viewerState.translateX = e.clientX - viewerState.startX;
            viewerState.translateY = e.clientY - viewerState.startY;
            updateViewerTransform();
        }
    };

    document.onmouseup = () => {
        if (viewerState.isDragging) {
            viewerState.isDragging = false;
            viewerImage.style.cursor = 'move';
        }
    };

    // Wheel zoom
    viewerContainer.onwheel = (e) => {
        e.preventDefault();
        if (e.deltaY < 0) {
            zoomIn();
        } else {
            zoomOut();
        }
    };

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
        if (!await showConfirm(`确定要删除选中的 ${count} 张图片吗？`, '批量删除')) {
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
            uploadPanel.style.display = 'none';
            return;
        }

        uploadPanel.style.display = 'block';

        uploadProgress.innerHTML = uploadQueue.map(item => {
            const statusText = {
                'pending': '等待中',
                'uploading': '上传中',
                'success': '完成',
                'error': '失败'
            }[item.status] || '未知';

            const progress = item.progress || 0;

            return `
                <div class="upload-item">
                    <div class="upload-item-header">
                        <div class="upload-item-name" title="${item.file.name}">${item.file.name}</div>
                        <div class="upload-item-status ${item.status}">${statusText}</div>
                    </div>
                    <div class="upload-item-progress">
                        <div class="upload-item-progress-bar ${item.status}" style="width: ${progress}%"></div>
                    </div>
                </div>
            `;
        }).join('');
    }

    async function processUploadQueue() {
        const pending = uploadQueue.find(i => i.status === 'pending');
        if (!pending) return;

        const uploading = uploadQueue.find(i => i.status === 'uploading');
        if (uploading) return;

        pending.status = 'uploading';
        renderUploadProgress();

        try {
            await uploadFile(pending.file, pending);
            pending.status = 'success';
        } catch (e) {
            pending.status = 'error';
        }

        renderUploadProgress();

        setTimeout(() => {
            uploadQueue = uploadQueue.filter(i => i.status !== 'success');
            renderUploadProgress();
        }, 3000);

        processUploadQueue();
    }

    async function uploadFile(file, queueItem) {
        const token = getToken();
        if (!token) {
            showToast('请先在设置中配置认证令牌');
            throw new Error('No token');
        }

        const formData = new FormData();
        formData.append('file', file);

        // Use XMLHttpRequest for real upload progress
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();

            // Upload progress event
            xhr.upload.onprogress = (e) => {
                if (e.lengthComputable) {
                    queueItem.progress = Math.round((e.loaded / e.total) * 100);
                    renderUploadProgress();
                }
            };

            xhr.onload = async () => {
                try {
                    const data = JSON.parse(xhr.responseText);

                    if (xhr.status !== 200) {
                        showToast('上传失败: ' + data.error);
                        reject(new Error(data.error));
                        return;
                    }

                    // 检查是否是重复文件
                    if (data.duplicate) {
                        showToast('文件已存在，返回已有链接', 3000);
                        // Don't add duplicate to list, just refresh
                        await loadAllImages();
                    } else {
                        showToast('上传成功: ' + data.filename);
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
                    }
                    loadStats();

                    resolve(data);
                } catch (error) {
                    reject(error);
                }
            };

            xhr.onerror = () => {
                reject(new Error('Network error'));
            };

            xhr.open('POST', '/api/upload');
            xhr.setRequestHeader('Authorization', 'Bearer ' + token);
            xhr.send(formData);
        });
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

    // Upload panel close button
    closeUploadPanel.onclick = () => {
        uploadQueue = [];
        renderUploadProgress();
    };

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
    settingsBtn.onclick = async () => {
        settingsTokenInput.value = getToken();
        defaultFormat.value = getDefaultFormat();
        settingsModal.classList.add('active');

        // Load server config
        await loadServerConfig();
    };

    closeSettings.onclick = () => {
        settingsModal.classList.remove('active');
        // Reset token input to password type when closing
        settingsTokenInput.type = 'password';
    };

    settingsModal.onclick = (e) => {
        if (e.target === settingsModal) {
            settingsModal.classList.remove('active');
            // Reset token input to password type when closing
            settingsTokenInput.type = 'password';
        }
    };

    toggleToken.onclick = () => {
        settingsTokenInput.type = settingsTokenInput.type === 'password' ? 'text' : 'password';
    };

    saveSettings.onclick = async () => {
        const token = settingsTokenInput.value;
        const format = defaultFormat.value;

        // Save local settings
        if (token) {
            localStorage.setItem('authToken', token);
            authToken = token;
        }
        localStorage.setItem('defaultFormat', format);

        // Save server config
        if (authToken) {
            const compressionCheckbox = $('configCompression');
            const config = {
                enable_compression: compressionCheckbox.checked,
                max_width: parseInt($('configMaxWidth').value),
                jpeg_quality: parseInt($('configJpegQuality').value),
                max_size: parseInt($('configMaxSize').value) * 1024 * 1024 // Convert MB to bytes
            };

            console.log('Saving config:', config);

            // Validate
            if (config.max_width < 100 || config.max_width > 10000) {
                showToast('最大宽度必须在 100-10000 之间');
                return;
            }

            if (config.jpeg_quality < 1 || config.jpeg_quality > 100) {
                showToast('JPEG质量必须在 1-100 之间');
                return;
            }

            if (config.max_size < 1024 * 1024 || config.max_size > 100 * 1024 * 1024) {
                showToast('最大文件大小必须在 1-100 MB 之间');
                return;
            }

            try {
                const res = await fetch('/api/config', {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + authToken
                    },
                    body: JSON.stringify(config)
                });

                const data = await res.json();
                console.log('Save response:', data);

                if (res.ok && data.success) {
                    showToast('设置已保存');
                    settingsModal.classList.remove('active');
                    // Reload config to verify
                    await loadServerConfig();
                } else {
                    showToast('保存失败: ' + (data.error || '未知错误'));
                }
            } catch (e) {
                console.error('Failed to save config:', e);
                showToast('保存失败');
            }
        } else {
            showToast('设置已保存');
            settingsModal.classList.remove('active');
        }
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

    deleteImage.onclick = async () => {
        if (await showConfirm('确定要删除这张图片吗？', '删除图片')) {
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

    logoutBtn.onclick = async () => {
        if (await showConfirm('确定要退出登录吗？', '退出登录')) {
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
