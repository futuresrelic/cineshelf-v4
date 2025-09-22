// Barcode Scanner Integration for CineShelf (iOS Compatible)
window.BarcodeScanner = (function() {
    let isScanning = false;
    let currentStream = null;

    function init() {
        document.getElementById('scanUpcBtn').addEventListener('click', open);
        
        document.getElementById('scannerModal').addEventListener('click', function(e) {
            if (e.target === this) {
                close();
            }
        });
    }

    function open() {
        const modal = document.getElementById('scannerModal');
        modal.classList.add('active');
        startCamera();
    }

    function close() {
        const modal = document.getElementById('scannerModal');
        modal.classList.remove('active');
        stopCamera();
    }

    async function startCamera() {
        if (isScanning) return;

        try {
            // Check HTTPS requirement for iOS
            if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
                throw new Error('Camera access requires HTTPS on iPhone/iOS. Please use https:// or enable HTTPS on your server.');
            }

            const scanner = document.getElementById('barcodeScanner');
            const overlay = document.getElementById('scannerOverlay');
            const placeholder = document.getElementById('scannerPlaceholder');

            // Check if getUserMedia is available
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                throw new Error('Camera not supported on this browser');
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

            console.log('CineShelf: Requesting camera access for barcode scanning...');
            
            // Stop any existing stream first
            if (currentStream) {
                currentStream.getTracks().forEach(track => track.stop());
            }

            // Request camera permission with iOS-friendly constraints
            currentStream = await navigator.mediaDevices.getUserMedia(constraints);
            
            console.log('CineShelf: Camera access granted, initializing Quagga...');

            const config = {
                inputStream: {
                    name: "Live",
                    type: "LiveStream",
                    target: scanner,
                    constraints: {
                        width: { min: 320, ideal: 640, max: 1280 },
                        height: { min: 240, ideal: 480, max: 720 },
                        facingMode: "environment",
                        frameRate: { ideal: 15, max: 30 }
                    }
                },
                decoder: {
                    readers: [
                        "ean_reader",
                        "ean_8_reader", 
                        "code_128_reader",
                        "code_39_reader",
                        "upc_reader",
                        "upc_e_reader"
                    ]
                },
                locate: true,
                locator: {
                    patchSize: "medium",
                    halfSample: true
                },
                numOfWorkers: navigator.hardwareConcurrency || 2,
                frequency: 10,
                debug: false
            };

            await new Promise((resolve, reject) => {
                Quagga.init(config, (err) => {
                    if (err) {
                        console.error('Quagga init error:', err);
                        reject(new Error(`Scanner initialization failed: ${err.message}`));
                    } else {
                        console.log('CineShelf: Quagga initialized successfully');
                        resolve();
                    }
                });
            });

            Quagga.onDetected((result) => {
                const code = result.codeResult.code;
                console.log('CineShelf: Barcode detected:', code);
                if (code && code.length >= 8) {
                    onBarcodeDetected(code);
                }
            });

            Quagga.start();
            isScanning = true;
            
            overlay.style.display = 'block';
            placeholder.style.display = 'none';

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
            
            alert(errorMessage);
            close();
        }
    }

    function stopCamera() {
        if (isScanning) {
            try {
                Quagga.stop();
                console.log('CineShelf: Quagga stopped');
            } catch (e) {
                console.error('Error stopping Quagga:', e);
            }
            isScanning = false;
        }

        if (currentStream) {
            currentStream.getTracks().forEach(track => {
                track.stop();
                console.log('CineShelf: Camera track stopped');
            });
            currentStream = null;
        }

        const overlay = document.getElementById('scannerOverlay');
        const placeholder = document.getElementById('scannerPlaceholder');
        
        if (overlay) overlay.style.display = 'none';
        if (placeholder) placeholder.style.display = 'block';
    }

    function onBarcodeDetected(code) {
        console.log('CineShelf: Processing barcode:', code);
        document.getElementById('upc').value = code;
        
        // Play success sound
        playBeep();
        
        // iOS-compatible vibration
        if (navigator.vibrate) {
            navigator.vibrate([100, 50, 100]);
        }
        
        // Show success message
        if (window.App && window.App.showStatus) {
            window.App.showStatus(`📱 Barcode scanned: ${code}`, 'success');
        }
        
        // Close scanner after brief delay
        setTimeout(() => {
            close();
        }, 500);
    }

    function playBeep() {
        try {
            // iOS-compatible audio context
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) return;
            
            const audioContext = new AudioContext();
            
            // Unlock audio context for iOS
            if (audioContext.state === 'suspended') {
                audioContext.resume();
            }
            
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
            gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
            
            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 0.2);
        } catch (error) {
            console.log('Audio not available:', error);
        }
    }

    return {
        init,
        open,
        close
    };
})();