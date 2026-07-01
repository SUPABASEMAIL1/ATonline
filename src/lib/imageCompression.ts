/**
 * Smart image compression utility for ZaynahsPos.
 * Converts images to WebP and targets a maximum file size of 10-20KB.
 */
export async function compressImage(
    file: File,
    maxWidth: number = 600,
    maxHeight: number = 600,
    initialQuality: number = 0.75
): Promise<File> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target?.result as string;
            img.onload = () => {
                let currentMaxWidth = maxWidth;
                let currentMaxHeight = maxHeight;
                let currentQuality = initialQuality;

                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    reject(new Error('Failed to get canvas context'));
                    return;
                }

                const attemptCompression = () => {
                    let width = img.width;
                    let height = img.height;

                    // Calculate aspect ratio and resize based on current bounds
                    if (width > height) {
                        if (width > currentMaxWidth) {
                            height *= currentMaxWidth / width;
                            width = currentMaxWidth;
                        }
                    } else {
                        if (height > currentMaxHeight) {
                            width *= currentMaxHeight / height;
                            height = currentMaxHeight;
                        }
                    }

                    canvas.width = width;
                    canvas.height = height;
                    ctx.clearRect(0, 0, width, height);
                    ctx.drawImage(img, 0, 0, width, height);

                    canvas.toBlob(
                        (blob) => {
                            if (blob) {
                                const fileSizeKB = blob.size / 1024;
                                console.log(`Smart compression check: size=${fileSizeKB.toFixed(2)}KB, dimensions=${width}x${height}, quality=${currentQuality.toFixed(2)}`);

                                // If the size is still too large (> 20KB)
                                if (fileSizeKB > 20) {
                                    // 1. Try lowering quality first if it's reasonably high
                                    if (currentQuality > 0.45) {
                                        currentQuality -= 0.15;
                                        attemptCompression();
                                    } 
                                    // 2. If quality is low, scale down dimensions to reduce pixel count
                                    else if (currentMaxWidth > 250 && currentMaxHeight > 250) {
                                        currentMaxWidth = Math.round(currentMaxWidth * 0.8);
                                        currentMaxHeight = Math.round(currentMaxHeight * 0.8);
                                        // Bump quality up slightly for the smaller image to preserve legibility
                                        currentQuality = Math.min(0.6, currentQuality + 0.1);
                                        attemptCompression();
                                    } 
                                    // 3. Fallback: drop quality to absolute minimum
                                    else if (currentQuality > 0.1) {
                                        currentQuality -= 0.05;
                                        attemptCompression();
                                    } 
                                    // 4. Force resolve if we cannot compress any further
                                    else {
                                        const compressedFile = new File([blob], file.name.replace(/\.[^/.]+$/, "") + ".webp", {
                                            type: 'image/webp',
                                            lastModified: Date.now(),
                                        });
                                        resolve(compressedFile);
                                    }
                                } else {
                                    const compressedFile = new File([blob], file.name.replace(/\.[^/.]+$/, "") + ".webp", {
                                        type: 'image/webp',
                                        lastModified: Date.now(),
                                    });
                                    console.log(`Final optimized WebP image resolved: size=${fileSizeKB.toFixed(2)}KB`);
                                    resolve(compressedFile);
                                }
                            } else {
                                reject(new Error('Canvas to Blob failed'));
                            }
                        },
                        'image/webp',
                        currentQuality
                    );
                };

                attemptCompression();
            };
            img.onerror = () => reject(new Error('Image loading failed'));
        };
        reader.onerror = () => reject(new Error('File reading failed'));
    });
}

