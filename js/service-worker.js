// Enhanced Service Worker Registration and PWA Installation for CineShelf
(function() {
    // Global installation state
    let deferredPrompt = null;
    let installationAvailable = false;
    let isInstalled = false;

    // Service Worker Registration
    if ('serviceWorker' in navigator) {
        const swFileName = 'cineshelf-sw.js';
        
        navigator.serviceWorker.register(swFileName)
            .then(registration => {
                console.log('CineShelf: Service Worker registered successfully:', registration);
                
                // Check for updates
                registration.addEventListener('updatefound', () => {
                    const newWorker = registration.installing;
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            showUpdateNotification();
                        }
                    });
                });
            })
            .catch(error => {
                console.log('CineShelf: Service Worker registration failed, but app will still work:', error);
            });

        navigator.serviceWorker.addEventListener('message', event => {
            if (event.data && event.data.type === 'CACHE_UPDATED') {
                console.log('CineShelf: Cache updated');
            }
        });
    }

    // Enhanced PWA Installation Logic
    window.addEventListener('beforeinstallprompt', (e) => {
        console.log('CineShelf: Install prompt available');
        e.preventDefault();
        deferredPrompt = e;
        installationAvailable = true;
        
        // Update install buttons immediately
        updateInstallButtons();
        
        // Show banner after short delay (not immediately to avoid annoyance)
        setTimeout(() => {
            if (deferredPrompt && !isInstalled) {
                showInstallBanner();
            }
        }, 3000);
    });

    // Enhanced Service Worker Update Handling
    window.addEventListener('DOMContentLoaded', () => {
        // Listen for service worker updates
        navigator.serviceWorker.addEventListener('message', event => {
            if (event.data && event.data.type === 'SW_UPDATED') {
                console.log('CineShelf: Service Worker updated to', event.data.version);
                showUpdateNotification();
            }
            
            if (event.data && event.data.type === 'FORCE_REFRESH_COMPLETE') {
                console.log('CineShelf: Force refresh complete, reloading...');
                setTimeout(() => window.location.reload(), 500);
            }
        });

        // Check if already installed
        if (window.matchMedia('(display-mode: standalone)').matches || 
            window.navigator.standalone === true) {
            isInstalled = true;
            console.log('CineShelf: Running as installed PWA');
        }
        
        // Update buttons on page load
        setTimeout(updateInstallButtons, 1000);
    });

    function showUpdateNotification() {
        const updateBanner = document.createElement('div');
        updateBanner.id = 'update-banner';
        updateBanner.innerHTML = `
            <div style="display: flex; align-items: center; gap: 12px;">
                <div style="flex: 1;">
                    <div style="font-weight: 600; margin-bottom: 4px;">🔄 CineShelf Updated!</div>
                    <div style="font-size: 12px; opacity: 0.9;">New version available with improvements</div>
                </div>
                <button id="update-now-btn" style="background: #28a745; border: none; color: white; padding: 8px 16px; border-radius: 16px; cursor: pointer; font-weight: 600; font-size: 13px;">Update Now</button>
                <button id="update-later-btn" style="background: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,255,0.3); color: white; padding: 8px 16px; border-radius: 16px; cursor: pointer; font-weight: 600; font-size: 13px;">Later</button>
            </div>
        `;
        
        updateBanner.style.cssText = `
            position: fixed;
            top: 20px;
            left: 20px;
            right: 20px;
            max-width: 400px;
            margin: 0 auto;
            background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
            color: white;
            padding: 16px;
            border-radius: 16px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.3);
            z-index: 10001;
            font-size: 14px;
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255,255,255,0.2);
            animation: slideDownUpdate 0.4s cubic-bezier(0.4, 0, 0.2, 1);
        `;

        // Add animation styles
        if (!document.getElementById('update-styles')) {
            const style = document.createElement('style');
            style.id = 'update-styles';
            style.textContent = `
                @keyframes slideDownUpdate {
                    from { transform: translateY(-100px); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }
            `;
            document.head.appendChild(style);
        }

        // Event listeners
        updateBanner.querySelector('#update-now-btn').addEventListener('click', forceAppUpdate);
        updateBanner.querySelector('#update-later-btn').addEventListener('click', () => {
            updateBanner.remove();
            // Show again in 1 hour
            setTimeout(showUpdateNotification, 3600000);
        });

        document.body.appendChild(updateBanner);
    }

    function showInstallBanner() {
        // Don't show if already installed or banner exists
        if (isInstalled || document.getElementById('install-banner')) {
            return;
        }

        const banner = document.createElement('div');
        banner.id = 'install-banner';
        banner.innerHTML = `
            <div style="display: flex; align-items: center; gap: 12px;">
                <div style="flex: 1;">
                    <div style="font-weight: 600; margin-bottom: 4px;">📱 Install CineShelf</div>
                    <div style="font-size: 12px; opacity: 0.9;">Add to your home screen for the best experience</div>
                </div>
                <button id="banner-install-btn" style="background: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,255,0.3); color: white; padding: 8px 16px; border-radius: 16px; cursor: pointer; font-weight: 600; font-size: 13px;">Install</button>
                <button id="banner-close-btn" style="background: none; border: none; color: white; cursor: pointer; font-size: 18px; padding: 4px; opacity: 0.7;">&times;</button>
            </div>
        `;
        
        banner.style.cssText = `
            position: fixed;
            bottom: 20px;
            left: 20px;
            right: 20px;
            max-width: 400px;
            margin: 0 auto;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 16px;
            border-radius: 16px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.3);
            z-index: 10000;
            font-size: 14px;
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255,255,255,0.2);
            animation: slideUpBanner 0.4s cubic-bezier(0.4, 0, 0.2, 1);
        `;

        // Add animation styles
        if (!document.getElementById('banner-styles')) {
            const style = document.createElement('style');
            style.id = 'banner-styles';
            style.textContent = `
                @keyframes slideUpBanner {
                    from { transform: translateY(100px); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }
                @keyframes slideDownBanner {
                    from { transform: translateY(0); opacity: 1; }
                    to { transform: translateY(100px); opacity: 0; }
                }
            `;
            document.head.appendChild(style);
        }

        // Add event listeners
        banner.querySelector('#banner-install-btn').addEventListener('click', triggerInstall);
        banner.querySelector('#banner-close-btn').addEventListener('click', hideInstallBanner);

        document.body.appendChild(banner);

        // Auto-hide after 15 seconds
        setTimeout(() => {
            if (document.getElementById('install-banner')) {
                hideInstallBanner();
            }
        }, 15000);
    }

    function hideInstallBanner() {
        const banner = document.getElementById('install-banner');
        if (banner) {
            banner.style.animation = 'slideDownBanner 0.3s ease-out forwards';
            setTimeout(() => {
                if (banner.parentNode) {
                    banner.remove();
                }
            }, 300);
        }
    }

    function updateInstallButtons() {
        // Update all install buttons in the app
        const installBtns = document.querySelectorAll('.pwa-install-btn');
        const forceInstallBtns = document.querySelectorAll('.force-install-btn');
        
        installBtns.forEach(btn => {
            if (isInstalled) {
                btn.textContent = '✅ App Installed';
                btn.disabled = true;
                btn.style.opacity = '0.6';
            } else if (installationAvailable) {
                btn.textContent = '📱 Install App';
                btn.disabled = false;
                btn.style.opacity = '1';
            } else {
                btn.textContent = '📱 Install (Use Share Menu)';
                btn.disabled = false;
                btn.style.opacity = '1';
            }
        });

        forceInstallBtns.forEach(btn => {
            if (isInstalled) {
                btn.style.display = 'none';
            } else {
                btn.style.display = 'block';
            }
        });
    }

    async function triggerInstall() {
        if (deferredPrompt) {
            // Use stored prompt
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            
            if (outcome === 'accepted') {
                console.log('CineShelf: User accepted the install prompt');
                hideInstallBanner();
            } else {
                console.log('CineShelf: User dismissed the install prompt');
                // Show alternative installation methods
                showAlternativeInstallMethods();
            }
            deferredPrompt = null;
            installationAvailable = false;
            updateInstallButtons();
        } else {
            // No deferred prompt available, show manual instructions
            showAlternativeInstallMethods();
        }
    }

    function showAlternativeInstallMethods() {
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        const isAndroid = /Android/.test(navigator.userAgent);
        const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
        
        let instructions = '';
        
        if (isIOS && isSafari) {
            instructions = `
                <h3>📱 Install on iPhone/iPad:</h3>
                <ol style="text-align: left; margin: 1rem 0;">
                    <li>Tap the <strong>Share button</strong> (⎋) at the bottom</li>
                    <li>Scroll down and tap <strong>"Add to Home Screen"</strong></li>
                    <li>Tap <strong>"Add"</strong> to confirm</li>
                </ol>
                <div style="background: rgba(255,255,255,0.1); padding: 12px; border-radius: 8px; margin: 12px 0; font-size: 13px;">
                    💡 The app icon will appear on your home screen like any other app!
                </div>
            `;
        } else if (isAndroid) {
            instructions = `
                <h3>📱 Install on Android:</h3>
                <ol style="text-align: left; margin: 1rem 0;">
                    <li>Tap the <strong>menu button</strong> (⋮) in your browser</li>
                    <li>Look for <strong>"Add to Home Screen"</strong> or <strong>"Install App"</strong></li>
                    <li>Tap <strong>"Install"</strong> to confirm</li>
                </ol>
                <div style="background: rgba(255,255,255,0.1); padding: 12px; border-radius: 8px; margin: 12px 0; font-size: 13px;">
                    💡 The app will install like any other Android app!
                </div>
            `;
        } else {
            instructions = `
                <h3>💻 Install on Desktop:</h3>
                <ol style="text-align: left; margin: 1rem 0;">
                    <li>Look for an <strong>install icon</strong> (⬇️) in your browser's address bar</li>
                    <li>Or check your browser's menu for <strong>"Install CineShelf"</strong></li>
                    <li>Click <strong>"Install"</strong> to add it to your computer</li>
                </ol>
                <div style="background: rgba(255,255,255,0.1); padding: 12px; border-radius: 8px; margin: 12px 0; font-size: 13px;">
                    💡 Works in Chrome, Edge, and other modern browsers!
                </div>
            `;
        }

        const modal = document.createElement('div');
        modal.id = 'install-modal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.8);
            backdrop-filter: blur(8px);
            z-index: 20000;
            display: flex;
            align-items: center;
            justify-content: center;
            animation: fadeIn 0.3s ease-out;
        `;

        modal.innerHTML = `
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 24px; border-radius: 20px; max-width: 380px; margin: 20px; text-align: center; position: relative; box-shadow: 0 20px 40px rgba(0,0,0,0.3);">
                <button id="close-install-modal" style="position: absolute; top: 12px; right: 12px; background: none; border: none; color: white; cursor: pointer; font-size: 24px; opacity: 0.7;">&times;</button>
                ${instructions}
                <div style="margin-top: 20px;">
                    <button id="got-it-btn" style="background: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,255,0.3); color: white; padding: 12px 24px; border-radius: 12px; cursor: pointer; font-weight: 600;">Got it!</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Add fade-in animation
        const style = document.createElement('style');
        style.textContent = `
            @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }
        `;
        document.head.appendChild(style);

        // Close modal handlers
        modal.querySelector('#close-install-modal').addEventListener('click', () => modal.remove());
        modal.querySelector('#got-it-btn').addEventListener('click', () => modal.remove());
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });
    }

    function forceShowInstallPrompt() {
        if (isInstalled) {
            if (window.App && window.App.showStatus) {
                window.App.showStatus('✅ CineShelf is already installed!', 'success');
            }
            return;
        }

        if (deferredPrompt) {
            triggerInstall();
        } else {
            showAlternativeInstallMethods();
        }
    }

    // Offline/Online detection
    window.addEventListener('online', () => {
        console.log('CineShelf: Back online');
        if (window.App && window.App.showStatus) {
            window.App.showStatus('🌐 Back online!', 'success');
        }
    });

    window.addEventListener('offline', () => {
        console.log('CineShelf: Gone offline');
        if (window.App && window.App.showStatus) {
            window.App.showStatus('📱 Offline mode - using cached data', 'error');
        }
    });

    window.addEventListener('appinstalled', (evt) => {
        console.log('CineShelf: App was installed successfully!');
        isInstalled = true;
        installationAvailable = false;
        deferredPrompt = null;
        hideInstallBanner();
        updateInstallButtons();
        
        // Show success message
        if (window.App && window.App.showStatus) {
            window.App.showStatus('🎉 CineShelf installed successfully!', 'success');
        }
    });

    // Auto-Update Functions
    function forceAppUpdate() {
        // Send message to service worker to skip waiting
        if (navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage({ type: 'SKIP_WAITING' });
        }
        
        // Reload the page
        setTimeout(() => {
            window.location.reload();
        }, 500);
    }

    function forceClearCacheAndRefresh() {
        // Send message to service worker to clear all caches
        if (navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage({ type: 'FORCE_REFRESH' });
        }
    }

    function checkForUpdates() {
        if (navigator.serviceWorker.controller) {
            // Manually check for updates
            navigator.serviceWorker.getRegistration().then(registration => {
                if (registration) {
                    registration.update().then(() => {
                        console.log('CineShelf: Checked for updates');
                        if (window.App && window.App.showStatus) {
                            window.App.showStatus('✅ Checked for updates', 'success');
                        }
                    });
                }
            });
        }
    }

    function getCurrentVersion() {
        // Return current cache version
        return new Promise((resolve) => {
            if (navigator.serviceWorker.controller) {
                navigator.serviceWorker.ready.then(registration => {
                    // Try to get version from cache names
                    caches.keys().then(cacheNames => {
                        const currentCache = cacheNames.find(name => name.startsWith('cineshelf-v'));
                        if (currentCache) {
                            const version = currentCache.replace('cineshelf-', '');
                            resolve(version);
                        } else {
                            resolve('unknown');
                        }
                    });
                });
            } else {
                resolve('no-sw');
            }
        });
    }

    // Expose PWA and Update functions globally
    window.CineShelfPWA = {
        showInstallBanner,
        hideInstallBanner,
        triggerInstall,
        forceShowInstallPrompt,
        showAlternativeInstallMethods,
        updateInstallButtons,
        isInstalled: () => isInstalled,
        isInstallationAvailable: () => installationAvailable
    };

    window.CineShelfUpdater = {
        forceAppUpdate,
        forceClearCacheAndRefresh,
        checkForUpdates,
        getCurrentVersion,
        showUpdateNotification
    };

    // Auto-update install buttons periodically
    setInterval(updateInstallButtons, 5000);
})();