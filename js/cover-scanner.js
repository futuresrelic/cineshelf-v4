// Cover Scanner Module (iOS Compatible)
window.CoverScanner = (function() {
    let stream = null;
    let capturedImages = [];
    
    const video = document.getElementById('coverVideo');
    const canvas = document.getElementById('coverCanvas');
    const ctx = canvas.getContext('2d');
    const capturedImagesDiv = document.getElementById('capturedImages');
    const fileInput = document.getElementById('fileInput');

    function init() {
        // File input handler
        fileInput.addEventListener('change', function(e) {
            const files = Array.from(e.target.files);
            files.forEach(file => {
                const reader = new FileReader();
                reader.onload = function(event) {
                    addCapturedImage(event.target.result);
                };
                reader.readAsDataURL(file);
            });
        });
        
        // Auto-fill API key from settings when available
        updateApiKeyFromSettings();
        
        // iOS compatibility check
        checkiOSCompatibility();
    }

    function checkiOSCompatibility() {
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        const isHTTPS = location.protocol === 'https:' || location.hostname === 'localhost';
        
        if (isIOS && !isHTTPS) {
            console.warn('CineShelf: iOS detected without HTTPS - camera may not work');
        }
    }

    function updateApiKeyFromSettings() {
        if (window.App && window.App.getSettings) {
            const settings = window.App.getSettings();
            if (settings.openaiApiKey) {
                document.getElementById('apiKey').value = settings.openaiApiKey;
            }
        }
    }

    async function startCamera() {
        try {
            // Check HTTPS requirement for iOS
            if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
                const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
                if (isIOS) {
                    throw new Error('Camera access requires HTTPS on iPhone/iOS. Please use https:// or enable HTTPS on your server.');
                }
            }

            // Check if getUserMedia is available
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                throw new Error('Camera not supported on this browser');
            }

            console.log('CineShelf: Requesting camera access for cover scanning...');

            // Stop any existing stream
            if (stream) {
                stream.getTracks().forEach(track => track.stop());
            }

            // iOS-optimized camera constraints
            const constraints = {
                video: {
                    facingMode: { ideal: 'environment' },
                    width: { ideal: 1280, max: 1920 },
                    height: { ideal: 720, max: 1080 },
                    frameRate: { ideal: 30, max: 60 }
                }
            };

            // Request camera permission
            stream = await navigator.mediaDevices.getUserMedia(constraints);
            
            console.log('CineShelf: Camera access granted for cover scanning');
            
            video.srcObject = stream;
            video.style.display = 'block';
            
            // Enable capture button when video loads
            video.onloadedmetadata = function() {
                document.getElementById('captureBtn').disabled = false;
                showCoverStatus('📷 Camera ready - point at DVD/Blu-ray covers', 'success');
            };

        } catch (error) {
            console.error('Camera error:', error);
            
            let errorMessage = 'Camera access failed: ' + error.message;
            
            // iOS-specific error messages
            if (error.name === 'NotAllowedError') {
                errorMessage = '📱 Camera permission denied. Please:\n1. Enable camera in Safari settings\n2. Reload the page and allow camera access';
            } else if (error.name === 'NotFoundError') {
                errorMessage = '📱 No camera found. Please ensure your device has a working camera.';
            } else if (error.name === 'NotSupportedError') {
                errorMessage = '📱 Camera not supported. Please try using Safari browser on iOS.';
            } else if (error.message.includes('HTTPS')) {
                errorMessage = '🔒 iPhone requires HTTPS for camera access.\n\nPlease:\n1. Use https:// instead of http://\n2. Or enable HTTPS on your web server';
            }
            
            showCoverStatus(errorMessage, 'error');
        }
    }

    function stopCamera() {
        if (stream) {
            stream.getTracks().forEach(track => {
                track.stop();
                console.log('CineShelf: Cover camera track stopped');
            });
            stream = null;
        }
        
        video.style.display = 'none';
        document.getElementById('captureBtn').disabled = true;
        showCoverStatus('📷 Camera stopped', 'success');
    }

    function captureImage() {
        if (!stream) {
            showCoverStatus('Please start camera first', 'error');
            return;
        }

        try {
            // Set canvas dimensions to match video
            canvas.width = video.videoWidth || 640;
            canvas.height = video.videoHeight || 480;
            
            // Draw current video frame to canvas
            ctx.drawImage(video, 0, 0);
            
            // Convert to data URL with good quality for AI analysis
            const imageData = canvas.toDataURL('image/jpeg', 0.9);
            addCapturedImage(imageData);
            
            // iOS-compatible vibration feedback
            if (navigator.vibrate) {
                navigator.vibrate([50, 30, 50]);
            }
            
            showCoverStatus('📸 Image captured successfully!', 'success');
        } catch (error) {
            console.error('Capture error:', error);
            showCoverStatus('Failed to capture image: ' + error.message, 'error');
        }
    }

    function addCapturedImage(imageData) {
        capturedImages.push(imageData);
        
        const img = document.createElement('img');
        img.src = imageData;
        img.className = 'captured-image';
        img.onclick = () => {
            const index = capturedImages.indexOf(imageData);
            if (index > -1) {
                capturedImages.splice(index, 1);
                img.remove();
                updateButtons();
                showCoverStatus('Image removed', 'success');
            }
        };
        
        capturedImagesDiv.appendChild(img);
        updateButtons();
    }

    function clearImages() {
        capturedImages = [];
        capturedImagesDiv.innerHTML = '';
        updateButtons();
        showCoverStatus('All images cleared', 'success');
    }

    function updateButtons() {
        const hasImages = capturedImages.length > 0;
        document.getElementById('clearBtn').disabled = !hasImages;
        document.getElementById('analyzeBtn').disabled = !hasImages;
    }

    async function testAPI() {
        const apiKey = document.getElementById('apiKey').value.trim();
        
        if (!apiKey) {
            showCoverStatus('Please enter an API key first', 'error');
            return;
        }
        
        if (!apiKey.startsWith('sk-')) {
            showCoverStatus('API key should start with "sk-"', 'error');
            return;
        }
        
        try {
            showCoverStatus('Testing API key...', 'success');
            
            const response = await fetch('https://api.openai.com/v1/models', {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                }
            });
            
            if (response.ok) {
                showCoverStatus('✅ API key is valid!', 'success');
                
                // Save API key to settings
                if (window.App && window.App.updateSetting) {
                    window.App.updateSetting('openaiApiKey', apiKey);
                }
            } else {
                const error = await response.json();
                showCoverStatus(`❌ API key invalid: ${error.error?.message || 'Unknown error'}`, 'error');
            }
        } catch (error) {
            showCoverStatus(`❌ Network error: ${error.message}`, 'error');
        }
    }

    async function analyzeImages() {
        const apiKey = document.getElementById('apiKey').value.trim();
        
        if (!apiKey) {
            showCoverStatus('Please enter your OpenAI API key first', 'error');
            return;
        }
        
        if (capturedImages.length === 0) {
            showCoverStatus('Please capture or upload some images first', 'error');
            return;
        }
        
        try {
            showCoverStatus(`🤖 Analyzing ${capturedImages.length} image(s) with AI...`, 'success');
            document.getElementById('coverLoading').style.display = 'block';
            
            const messages = [
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": "Please analyze these DVD/Blu-ray covers and extract the movie titles. Return ONLY a simple list with one title per line, nothing else. Focus on the main movie title, ignore special edition text, studio names, and other details."
                        },
                        ...capturedImages.map(imageData => ({
                            "type": "image_url",
                            "image_url": {
                                "url": imageData,
                                "detail": "high"
                            }
                        }))
                    ]
                }
            ];

            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: "gpt-4o",
                    messages: messages,
                    max_tokens: 500,
                    temperature: 0.1
                })
            });

            document.getElementById('coverLoading').style.display = 'none';

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error?.message || `HTTP ${response.status}`);
            }

            const data = await response.json();
            const extractedText = data.choices[0].message.content.trim();
            
            showList(extractedText);
            showCoverStatus(`✅ Found ${extractedText.split('\n').length} movie titles!`, 'success');

        } catch (error) {
            document.getElementById('coverLoading').style.display = 'none';
            console.error('AI Analysis error:', error);
            showCoverStatus(`❌ Analysis failed: ${error.message}`, 'error');
        }
    }

    function showList(text) {
        const titles = text.split('\n').filter(title => title.trim());
        
        let html = '<h3>🎬 Extracted Movie Titles:</h3>';
        html += '<div style="background: rgba(255,255,255,0.1); padding: 1rem; border-radius: 12px; margin: 1rem 0;">';
        
        titles.forEach((title, index) => {
            const cleanTitle = title.trim().replace(/^\d+\.\s*/, '');
            html += `
                <div style="margin: 0.5rem 0; padding: 0.75rem; background: rgba(255,255,255,0.1); border-radius: 8px; display: flex; align-items: center; gap: 0.75rem;">
                    <span style="flex: 1; font-weight: 500;">${cleanTitle}</span>
                    <button onclick="CoverScanner.useTitle('${cleanTitle.replace(/'/g, "\\'")}')" 
                            style="background: #48bb78; color: white; border: none; padding: 0.5rem 1rem; border-radius: 6px; cursor: pointer; font-size: 0.85rem;">
                        ➕ Add
                    </button>
                </div>
            `;
        });
        
        html += '</div>';
        html += `
            <div style="margin: 1rem 0; display: flex; gap: 0.75rem;">
                <button onclick="CoverScanner.copyText('${text.replace(/'/g, "\\'")}')" 
                        style="background: rgba(255,255,255,0.2); color: white; border: 1px solid rgba(255,255,255,0.3); padding: 0.75rem 1rem; border-radius: 8px; cursor: pointer; flex: 1;">
                    📋 Copy List
                </button>
                <button onclick="CoverScanner.addNewTitle()" 
                        style="background: #667eea; color: white; border: none; padding: 0.75rem 1rem; border-radius: 8px; cursor: pointer; flex: 1;">
                    ➕ Add Custom Title
                </button>
            </div>
        `;
        
        const outputDiv = document.getElementById('outputArea') || createOutputArea();
        outputDiv.innerHTML = html;
    }

    function createOutputArea() {
        const outputDiv = document.createElement('div');
        outputDiv.id = 'outputArea';
        outputDiv.style.marginTop = '1.5rem';
        document.getElementById('covers').appendChild(outputDiv);
        return outputDiv;
    }

    function useTitle(title) {
        if (window.App && window.App.setTitleFromCoverScanner) {
            window.App.setTitleFromCoverScanner(title);
            showCoverStatus(`✅ Added "${title}" to scan form`, 'success');
        } else {
            showCoverStatus('❌ Could not add title - please refresh page', 'error');
        }
    }

    function addNewTitle() {
        const title = prompt('Enter movie title:');
        if (title && title.trim()) {
            useTitle(title.trim());
        }
    }

    function copyText(text) {
        if (!text) {
            showCoverStatus('No text to copy', 'error');
            return;
        }
        
        try {
            // iOS-compatible clipboard access
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text).then(() => {
                    showCoverStatus('✅ Copied to clipboard!', 'success');
                }).catch(() => {
                    fallbackCopy(text);
                });
            } else {
                fallbackCopy(text);
            }
        } catch (error) {
            fallbackCopy(text);
        }
    }

    function fallbackCopy(text) {
        // Fallback copy method for iOS
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        
        try {
            const successful = document.execCommand('copy');
            if (successful) {
                showCoverStatus('✅ Copied to clipboard!', 'success');
            } else {
                showCoverStatus('❌ Copy failed - please select and copy manually', 'error');
            }
        } catch (error) {
            showCoverStatus('❌ Copy not supported - please select and copy manually', 'error');
        }
        
        document.body.removeChild(textArea);
    }

    function showCoverStatus(message, type) {
        const status = document.getElementById('coverStatus');
        status.textContent = message;
        status.className = `status ${type} show`;
        status.style.display = 'block';
        
        setTimeout(() => {
            status.classList.remove('show');
            setTimeout(() => {
                if (!status.classList.contains('show')) {
                    status.style.display = 'none';
                }
            }, 300);
        }, 5000);
    }

    return {
        init,
        startCamera,
        stopCamera,
        captureImage,
        clearImages,
        testAPI,
        analyzeImages,
        useTitle,
        addNewTitle,
        showList,
        copyText
    };
})();