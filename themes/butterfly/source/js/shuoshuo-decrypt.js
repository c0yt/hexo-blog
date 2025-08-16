/* global CryptoJS */

'use strict';

// Shuoshuo解密功能 - 继承hexo-blog-encrypt的解密逻辑
(() => {
  'use strict';

  let cryptoObj = window.crypto || window.msCrypto;
  const storage = window.localStorage;

  // 尝试多种方式获取 crypto 对象
  function initCrypto() {
    console.log('Initializing crypto...');
    console.log('window.crypto:', window.crypto);
    console.log('window.msCrypto:', window.msCrypto);
    console.log('location.protocol:', location.protocol);
    console.log('location.hostname:', location.hostname);

    let crypto = window.crypto || window.msCrypto;

    if (crypto && !crypto.subtle) {
      console.log('crypto.subtle not available, trying alternatives...');

      // 尝试不同的前缀
      if (crypto.webkitSubtle) {
        console.log('Using webkitSubtle');
        crypto.subtle = crypto.webkitSubtle;
      } else if (crypto.mozSubtle) {
        console.log('Using mozSubtle');
        crypto.subtle = crypto.mozSubtle;
      } else if (window.msCrypto && window.msCrypto.subtle) {
        console.log('Using msCrypto.subtle');
        crypto = window.msCrypto;
      }
    }

    return crypto;
  }

  // 重新初始化 crypto 对象
  cryptoObj = initCrypto();

  // 安全的 subtle 访问函数
  function getSubtle() {
    if (!cryptoObj) {
      console.error('cryptoObj is null');
      throw new Error('Web Crypto API not available - please use HTTPS or a supported browser');
    }

    if (!cryptoObj.subtle) {
      console.error('cryptoObj.subtle is null');
      console.log('Available crypto properties:', Object.keys(cryptoObj));

      // 最后一次尝试
      if (window.crypto && window.crypto.subtle) {
        console.log('Found window.crypto.subtle, using it');
        return window.crypto.subtle;
      }

      throw new Error('Web Crypto API subtle not available - please use HTTPS or a supported browser');
    }

    return cryptoObj.subtle;
  }

  // 检查 Web Crypto API 支持
  function checkCryptoSupport() {
    console.log('Checking crypto support...');
    console.log('window.crypto:', window.crypto);
    console.log('window.msCrypto:', window.msCrypto);
    console.log('cryptoObj:', cryptoObj);
    console.log('location.protocol:', location.protocol);
    console.log('location.hostname:', location.hostname);

    if (!cryptoObj) {
      console.error('Web Crypto API not supported - cryptoObj is null');
      return false;
    }

    // 在某些移动端浏览器中，subtle 可能需要在安全上下文中才能访问
    if (!cryptoObj.subtle) {
      console.error('Web Crypto API subtle not supported');
      console.log('Trying to access subtle in different ways...');

      // 尝试不同的访问方式
      if (cryptoObj.webkitSubtle) {
        console.log('Found webkitSubtle, using it as fallback');
        cryptoObj.subtle = cryptoObj.webkitSubtle;
        return true;
      }

      return false;
    }

    console.log('Web Crypto API support check passed');
    return true;
  }

  const keySalt = textToArray('hexo-blog-encrypt的作者们都是大帅比!');
  const ivSalt = textToArray('hexo-blog-encrypt是地表最强Hexo加密插件!');
  const knownPrefix = "<hbe-prefix></hbe-prefix>";

  function textToArray(s) {
    var i = s.length;
    var n = 0;
    var ba = new Array()

    for (var j = 0; j < i;) {
      var c = s.codePointAt(j);
      if (c < 128) {
        ba[n++] = c;
        j++;
      } else if ((c > 127) && (c < 2048)) {
        ba[n++] = (c >> 6) | 192;
        ba[n++] = (c & 63) | 128;
        j++;
      } else if ((c > 2047) && (c < 65536)) {
        ba[n++] = (c >> 12) | 224;
        ba[n++] = ((c >> 6) & 63) | 128;
        ba[n++] = (c & 63) | 128;
        j++;
      } else {
        ba[n++] = (c >> 18) | 240;
        ba[n++] = ((c >> 12) & 63) | 128;
        ba[n++] = ((c >> 6) & 63) | 128;
        ba[n++] = (c & 63) | 128;
        j += 2;
      }
    }
    return new Uint8Array(ba);
  }

  function hexToArray(s) {
    return new Uint8Array(s.match(/[\da-f]{2}/gi).map((h => {
      return parseInt(h, 16);
    })));
  }

  async function getExecutableScript(oldElem) {
    let out = document.createElement('script');
    const attList = ['type', 'text', 'src', 'crossorigin', 'defer', 'referrerpolicy'];
    attList.forEach((att) => {
      if (oldElem[att])
        out[att] = oldElem[att];
    })

    return out;
  }

  async function convertHTMLToElement(content) {
    let out = document.createElement('div');
    out.innerHTML = content;
    out.querySelectorAll('script').forEach(async (elem) => {
      elem.replaceWith(await getExecutableScript(elem));
    });

    return out;
  }

  function getKeyMaterial(password) {
    let encoder = new TextEncoder();
    return getSubtle().importKey(
      'raw',
      encoder.encode(password),
      {
        'name': 'PBKDF2',
      },
      false,
      [
        'deriveKey',
        'deriveBits',
      ]
    );
  }

  function getHmacKey(keyMaterial) {
    return getSubtle().deriveKey({
      'name': 'PBKDF2',
      'hash': 'SHA-256',
      'salt': keySalt.buffer,
      'iterations': 1024
    }, keyMaterial, {
      'name': 'HMAC',
      'hash': 'SHA-256',
      'length': 256,
    }, true, [
      'verify',
    ]);
  }

  function getDecryptKey(keyMaterial) {
    return getSubtle().deriveKey({
      'name': 'PBKDF2',
      'hash': 'SHA-256',
      'salt': keySalt.buffer,
      'iterations': 1024,
    }, keyMaterial, {
      'name': 'AES-CBC',
      'length': 256,
    }, true, [
      'decrypt',
    ]);
  }

  function getIv(keyMaterial) {
    return getSubtle().deriveBits({
      'name': 'PBKDF2',
      'hash': 'SHA-256',
      'salt': ivSalt.buffer,
      'iterations': 512,
    }, keyMaterial, 16 * 8);
  }

  async function verifyContent(key, content, hmacDigest) {
    const encoder = new TextEncoder();
    const encoded = encoder.encode(content);

    let signature = hexToArray(hmacDigest);

    const result = await getSubtle().verify({
      'name': 'HMAC',
      'hash': 'SHA-256',
    }, key, signature, encoded);

    return result;
  }

  async function decrypt(decryptKey, iv, hmacKey, encryptedData, hmacDigest, container) {
    let typedArray = hexToArray(encryptedData);

    const result = await getSubtle().decrypt({
      'name': 'AES-CBC',
      'iv': iv,
    }, decryptKey, typedArray.buffer).then(async (result) => {
      const decoder = new TextDecoder();
      const decoded = decoder.decode(result);

      // check the prefix, if not then we can sure here is wrong password.
      if (!decoded.startsWith(knownPrefix)) {
        throw "Decode successfully but not start with KnownPrefix.";
      }

      // 移除前缀并渲染markdown内容
      const content = decoded.substring(knownPrefix.length);
      let renderedContent = content;
      
      // 简单的markdown渲染（换行处理）
      renderedContent = renderedContent.replace(/\n/g, '<br>');
      
      container.innerHTML = renderedContent;

      // support html5 lazyload functionality.
      container.querySelectorAll('img').forEach((elem) => {
        if (elem.getAttribute("data-src") && !elem.src) {
          elem.src = elem.getAttribute('data-src');
        }
      });

      // 显示解密成功的萌化提示
      showCuteNotification('', '哇噻，你居然猜对了喵 ~', 'success');

      // 解密成功后显示标签和评论按钮
      showShuoshuoFooter(container);

      // trigger event
      var event = new Event('hexo-blog-decrypt');
      window.dispatchEvent(event);

      return await verifyContent(hmacKey, decoded, hmacDigest);
    }).catch((e) => {
      // 使用萌化的通知提示，而不是alert弹窗
      showCuteNotification('', '哒咩 ~ 主人不让我告诉你捏', 'error');
      console.log(e);
      return false;
    });

    return result;
  }

  // 显示shuoshuo的标签和评论按钮
  function showShuoshuoFooter(container) {
    // 从容器ID中提取key
    const containerId = container.id;
    const key = containerId.replace('shuoshuo-encrypt-', '');

    // 查找对应的shuoshuo项目
    const shuoshuoItem = container.closest('.shuoshuo-item');
    if (!shuoshuoItem) return;

    // 从全局数据中获取shuoshuo信息（如果可用）
    if (window.shuoshuoData && window.shuoshuoData[key]) {
      const itemData = window.shuoshuoData[key];

      // 创建footer元素
      const footer = document.createElement('div');
      footer.className = 'shuoshuo-footer';

      let footerContent = '';

      // 添加标签
      if (itemData.tags && itemData.tags.length > 0) {
        footer.classList.add('flex-between');
        footerContent += '<div class="shuoshuo-tags">';
        itemData.tags.forEach(tag => {
          footerContent += `<span class="shuoshuo-tag">${tag}</span>`;
        });
        footerContent += '</div>';
      } else {
        footer.classList.add('flex-end');
      }

      // 添加评论按钮
      if (itemData.key && window.commentsJsLoad) {
        footerContent += `
          <div class="shuoshuo-comment-btn" onclick="addCommentToShuoshuo(event)">
            <i class="fa-solid fa-comments"></i>
          </div>
        `;
      }

      footer.innerHTML = footerContent;

      // 将footer添加到shuoshuo内容后面
      const shuoshuoContent = shuoshuoItem.querySelector('.shuoshuo-content');
      if (shuoshuoContent) {
        shuoshuoContent.parentNode.insertBefore(footer, shuoshuoContent.nextSibling);
      }

      // 添加评论区域
      if (itemData.key && window.commentsJsLoad) {
        const commentDiv = document.createElement('div');
        commentDiv.className = 'shuoshuo-comment no-comment';
        commentDiv.setAttribute('data-key', itemData.key);
        shuoshuoItem.appendChild(commentDiv);
      }
    }
  }

  function initShuoshuoEncrypt() {
    // 查找所有shuoshuo加密容器
    const containers = document.querySelectorAll('[id^="shuoshuo-encrypt-"]');
    
    containers.forEach(container => {
      const dataElement = container.querySelector('script[type="hbeData"]');
      if (!dataElement) return;
      
      const encryptedData = dataElement.innerText;
      const hmacDigest = dataElement.dataset['hmacdigest'];
      
      // 检测是否为移动设备
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth <= 768;
      console.log('Device detection - isMobile:', isMobile, 'userAgent:', navigator.userAgent, 'window.innerWidth:', window.innerWidth);

      const passwordInput = container.querySelector('input[type="password"]');
      console.log('passwordInput found:', !!passwordInput);
      console.log('encryptedData available:', !!encryptedData);
      console.log('hmacDigest available:', !!hmacDigest);
      console.log('container:', container.id);

      if (passwordInput) {
        // 解密函数
        const performDecrypt = async () => {
          const password = passwordInput.value;
          console.log('performDecrypt called, password length:', password ? password.length : 0);
          console.log('encryptedData:', encryptedData ? encryptedData.substring(0, 50) + '...' : 'null');
          console.log('hmacDigest:', hmacDigest);

          if (!password.trim()) {
            console.log('Password is empty');
            return;
          }

          // 先检查基本的 crypto 支持，但不阻止执行
          checkCryptoSupport();

          console.log('cryptoObj:', cryptoObj);
          console.log('cryptoObj.subtle:', cryptoObj.subtle);

          try {
            console.log('Starting key generation...');
            const keyMaterial = await getKeyMaterial(password);
            console.log('keyMaterial generated');

            const hmacKey = await getHmacKey(keyMaterial);
            console.log('hmacKey generated');

            const decryptKey = await getDecryptKey(keyMaterial);
            console.log('decryptKey generated');

            const iv = await getIv(keyMaterial);
            console.log('iv generated');

            console.log('Starting decryption...');
            decrypt(decryptKey, iv, hmacKey, encryptedData, hmacDigest, container).then((result) => {
              console.log(`Decrypt result: ${result}`);
              // decrypt函数内部已经处理了成功和失败的情况，这里不需要额外处理
            }).catch((error) => {
              console.error('Decryption failed in decrypt function:', error);
              showCuteNotification('', '哒咩 ~ 主人不让我告诉你捏', 'error');
            });
          } catch (error) {
            console.error('Decryption error in performDecrypt:', error);
            console.error('Error stack:', error.stack);
            showCuteNotification('', '解密过程出现错误: ' + error.message, 'error');
          }
        };

        if (isMobile) {
          // 移动端：添加确认按钮
          const inputContainer = passwordInput.parentElement;
          if (inputContainer && !inputContainer.querySelector('.mobile-confirm-btn')) {
            const confirmBtn = document.createElement('button');
            confirmBtn.className = 'mobile-confirm-btn';
            confirmBtn.innerHTML = '→';
            confirmBtn.type = 'button';
            confirmBtn.style.cssText = `
              position: absolute;
              right: 10px;
              top: 50%;
              transform: translateY(-50%);
              background: transparent;
              color: #84AF9B;
              border: 2px solid #84AF9B;
              border-radius: 4px;
              width: 32px;
              height: 32px;
              font-size: 16px;
              font-weight: bold;
              cursor: pointer;
              z-index: 10;
              display: flex;
              align-items: center;
              justify-content: center;
              transition: all 0.3s cubic-bezier(0, 0.25, 0.5, 1);
            `;

            // 添加触摸效果，适配移动端
            let touchProcessed = false;

            confirmBtn.addEventListener('touchstart', () => {
              confirmBtn.style.background = '#84AF9B';
              confirmBtn.style.color = 'white';
              confirmBtn.style.transform = 'translateY(-50%) scale(0.95)';
            });

            confirmBtn.addEventListener('touchend', async (event) => {
              event.preventDefault();
              event.stopPropagation();

              // 恢复样式
              confirmBtn.style.background = 'transparent';
              confirmBtn.style.color = '#84AF9B';
              confirmBtn.style.transform = 'translateY(-50%) scale(1)';

              // 防止重复触发
              if (touchProcessed) return;
              touchProcessed = true;

              console.log('Mobile decrypt button touched');
              try {
                await performDecrypt();
              } catch (error) {
                console.error('Mobile decrypt touch error:', error);
                showCuteNotification('', '移动端解密失败', 'error');
              }

              // 重置标志
              setTimeout(() => { touchProcessed = false; }, 500);
            });

            // 添加悬停效果，符合xray主题（主要用于桌面端）
            confirmBtn.addEventListener('mouseenter', () => {
              if (!touchProcessed) {
                confirmBtn.style.background = '#84AF9B';
                confirmBtn.style.color = 'white';
                confirmBtn.style.transform = 'translateY(-50%) translateX(-2px)';
              }
            });

            confirmBtn.addEventListener('mouseleave', () => {
              if (!touchProcessed) {
                confirmBtn.style.background = 'transparent';
                confirmBtn.style.color = '#84AF9B';
                confirmBtn.style.transform = 'translateY(-50%) translateX(0)';
              }
            });

            // 点击事件（作为备用）
            confirmBtn.addEventListener('click', async (event) => {
              event.preventDefault();
              event.stopPropagation();

              // 如果已经通过触摸处理了，就不再处理点击
              if (touchProcessed) return;

              console.log('Mobile decrypt button clicked');
              try {
                await performDecrypt();
              } catch (error) {
                console.error('Mobile decrypt error:', error);
                showCuteNotification('', '移动端解密失败', 'error');
              }
            });

            inputContainer.style.position = 'relative';
            inputContainer.appendChild(confirmBtn);
          }

          // 移动端阻止回车键默认行为
          passwordInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              event.stopPropagation();
            }
          });
        } else {
          // 桌面端：保持回车确认
          passwordInput.addEventListener('keydown', async (event) => {
            if (event.key === 'Enter' && !event.isComposing) {
              event.preventDefault();
              console.log('Desktop decrypt enter pressed');
              try {
                await performDecrypt();
              } catch (error) {
                console.error('Desktop decrypt error:', error);
                showCuteNotification('', '桌面端解密失败', 'error');
              }
            }
          });
        }
      }
    });
  }

  // 初始化函数
  function init() {
    // 如果页面中有shuoshuo加密容器，则初始化
    if (document.querySelector('[id^="shuoshuo-encrypt-"]')) {
      initShuoshuoEncrypt();
    }
  }

  // 页面加载完成后初始化
  if (window.pjax) {
    document.addEventListener('pjax:complete', init);
  } else {
    document.addEventListener('DOMContentLoaded', init);
  }
  
  // 如果页面已经加载完成
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // 萌化通知函数 - 模仿custom.js的风格
  function showCuteNotification(title, message, type = 'info') {
    // 检查是否有Vue实例和$notify方法
    if (typeof Vue !== 'undefined' && window.app && window.app.$notify) {
      window.app.$notify({
        title: title,
        message: message,
        position: "top-right",
        offset: 50,
        showClose: true,
        type: type,
        duration: 3000
      });
    } else {
      // 如果没有Vue通知系统，创建一个简单的通知
      createSimpleNotification(title, message, type);
    }
  }

  // 简单通知函数（备用方案）
  function createSimpleNotification(title, message, type) {
    const notification = document.createElement('div');
    notification.className = `cute-notification cute-notification-${type}`;

    // 根据类型选择图标和颜色 - 简约风格
    const iconMap = {
      'success': { icon: '●', color: '#84AF9B', bgColor: 'rgba(132, 175, 155, 0.1)' },
      'error': { icon: '●', color: '#ff6b6b', bgColor: 'rgba(255, 107, 107, 0.1)' },
      'warning': { icon: '●', color: '#ffa726', bgColor: 'rgba(255, 167, 38, 0.1)' }
    };

    const config = iconMap[type] || iconMap['success'];

    notification.innerHTML = `
      <div class="cute-notification-icon">${config.icon}</div>
      <div class="cute-notification-content">
        <div class="cute-notification-title">${title}</div>
        ${message ? `<div class="cute-notification-message">${message}</div>` : ''}
      </div>
      <button class="cute-notification-close">×</button>
    `;

    // 添加样式 - 简约风格
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: ${config.bgColor};
      border-radius: 6px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      padding: 12px 16px;
      max-width: 280px;
      z-index: 9999;
      border-left: 3px solid ${config.color};
      animation: slideInRight 0.3s ease;
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 14px;
    `;

    // 添加动画样式
    if (!document.querySelector('#cute-notification-styles')) {
      const style = document.createElement('style');
      style.id = 'cute-notification-styles';
      style.textContent = `
        @keyframes slideInRight {
          from {
            transform: translateX(100%) scale(0.9);
            opacity: 0;
          }
          to {
            transform: translateX(0) scale(1);
            opacity: 1;
          }
        }

        @keyframes fadeOut {
          from {
            transform: translateX(0) scale(1);
            opacity: 1;
          }
          to {
            transform: translateX(100%) scale(0.9);
            opacity: 0;
          }
        }

        .cute-notification-icon {
          font-size: 12px;
          line-height: 1;
          flex-shrink: 0;
          color: ${config.color};
        }

        .cute-notification-content {
          flex: 1;
          color: #333;
        }

        .cute-notification-title {
          font-weight: 500;
          font-size: 14px;
          line-height: 1.4;
          margin: 0;
        }

        .cute-notification-message {
          color: #666;
          font-size: 13px;
          line-height: 1.4;
          margin: 0;
        }

        .cute-notification-close {
          background: none;
          border: none;
          font-size: 16px;
          cursor: pointer;
          color: #999;
          padding: 0;
          margin-left: 8px;
          line-height: 1;
        }

        .cute-notification-close:hover {
          color: #666;
        }
      `;
      document.head.appendChild(style);
    }

    document.body.appendChild(notification);

    // 关闭函数
    const closeNotification = () => {
      notification.style.animation = 'fadeOut 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
      setTimeout(() => {
        if (notification.parentNode) {
          notification.remove();
        }
      }, 300);
    };

    // 关闭按钮事件
    notification.querySelector('.cute-notification-close').onclick = closeNotification;

    // 点击通知框也可以关闭
    notification.onclick = (e) => {
      if (e.target === notification || e.target.classList.contains('cute-notification-content')) {
        closeNotification();
      }
    };

    // 3秒后自动消失
    setTimeout(() => {
      if (notification.parentNode) {
        closeNotification();
      }
    }, 3000);
  }

})();
