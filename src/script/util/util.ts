/*
 * Wire
 * Copyright (C) 2018 Wire Swiss GmbH
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see http://www.gnu.org/licenses/.
 *
 */

import {Decoder, Encoder} from 'bazinga64';
import CryptoJS from 'crypto-js';
import {ObservableArray} from 'knockout';
import {formatE164} from 'phoneformat.js';
import UUID from 'uuidjs';

import {Environment} from './Environment';
import {loadValue} from './StorageUtil';

import {Config} from '../auth/config';
import {QUERY_KEY} from '../auth/route';
import * as URLUtil from '../auth/util/urlUtil';
import {Conversation} from '../entity/Conversation';
import {StorageKey} from '../storage/StorageKey';

export const isTemporaryClientAndNonPersistent = (): boolean => {
  const enableTransientTemporaryClients =
    URLUtil.getURLParameter(QUERY_KEY.PERSIST_TEMPORARY_CLIENTS) === 'false' ||
    (Config.FEATURE && Config.FEATURE.PERSIST_TEMPORARY_CLIENTS === false);
  return loadValue(StorageKey.AUTH.PERSIST) === false && enableTransientTemporaryClients;
};

export const checkIndexedDb = (): Promise<void> => {
  if (isTemporaryClientAndNonPersistent()) {
    return Promise.resolve();
  }

  if (!Environment.browser.supports.indexedDb) {
    const errorType = Environment.browser.edge
      ? z.error.AuthError.TYPE.PRIVATE_MODE
      : z.error.AuthError.TYPE.INDEXED_DB_UNSUPPORTED;
    return Promise.reject(new z.error.AuthError(errorType));
  }

  if (Environment.browser.firefox) {
    let dbOpenRequest: IDBOpenDBRequest;

    try {
      dbOpenRequest = window.indexedDB.open('test');
      dbOpenRequest.onerror = event => {
        if (dbOpenRequest.error) {
          event.preventDefault();
          return Promise.reject(new z.error.AuthError(z.error.AuthError.TYPE.PRIVATE_MODE));
        }
        return undefined;
      };
    } catch (error) {
      return Promise.reject(new z.error.AuthError(z.error.AuthError.TYPE.PRIVATE_MODE));
    }

    return new Promise((resolve, reject) => {
      let currentAttempt = 0;
      const interval = 10;
      const maxRetry = 50;

      const interval_id = window.setInterval(() => {
        currentAttempt += 1;

        if (dbOpenRequest.readyState === 'done' && !dbOpenRequest.result) {
          window.clearInterval(interval_id);
          return reject(new z.error.AuthError(z.error.AuthError.TYPE.PRIVATE_MODE));
        }

        const tooManyAttempts = currentAttempt >= maxRetry;
        if (tooManyAttempts) {
          window.clearInterval(interval_id);
          resolve();
        }
      }, interval);
    });
  }

  return Promise.resolve();
};

export const loadDataUrl = (file: Blob): Promise<string | ArrayBuffer> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

export const loadUrlBuffer = (
  url: string,
  xhrAccessorFunction?: (xhr: XMLHttpRequest) => void,
): Promise<{buffer: ArrayBuffer; mimeType: string}> => {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.responseType = 'arraybuffer';

    xhr.onload = () => {
      const isStatusOK = xhr.status === 200;
      return isStatusOK
        ? resolve({buffer: xhr.response, mimeType: xhr.getResponseHeader('content-type')})
        : reject(new Error(xhr.status.toString(10)));
    };

    xhr.onerror = reject;

    if (typeof xhrAccessorFunction === 'function') {
      xhrAccessorFunction(xhr);
    }
    xhr.send();
  });
};

export const loadImage = function(blob: Blob): Promise<GlobalEventHandlers> {
  return new Promise((resolve, reject) => {
    const object_url = window.URL.createObjectURL(blob);
    const img = new Image();
    img.onload = function(): void {
      resolve(this);
      window.URL.revokeObjectURL(object_url);
    };
    img.onerror = reject;
    img.src = object_url;
  });
};

export const loadFileBuffer = (file: Blob | File): Promise<string | ArrayBuffer> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
};

export const loadUrlBlob = (url: string): Promise<Blob> => {
  return loadUrlBuffer(url).then(({buffer, mimeType}) => new Blob([new Uint8Array(buffer)], {type: mimeType}));
};

export const getFileExtension = (filename: string): string => {
  const extensionMatch = filename.match(/\.(tar\.gz|[^.]*)$/i);
  const foundExtension = extensionMatch && extensionMatch[1];
  return foundExtension || '';
};

export const trimFileExtension = (filename: string): string => {
  if (typeof filename === 'string') {
    if (filename.endsWith('.tar.gz')) {
      filename = filename.replace(/\.tar\.gz$/, '');
    }

    return filename.replace(/\.[^/.]+$/, '');
  }

  return '';
};

export const formatBytes = (bytes: number, decimals: number): string => {
  if (bytes === 0) {
    return '0B';
  }

  const kilobytes = 1024;
  decimals = decimals + 1 || 2;
  const unit = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  const index = Math.floor(Math.log(bytes) / Math.log(kilobytes));
  return parseFloat((bytes / Math.pow(kilobytes, index)).toFixed(decimals)) + unit[index];
};

export const getContentTypeFromDataUrl = (dataUrl: string): string => {
  return dataUrl.match(/^.*:(.*);.*,/)[1];
};

export const stripDataUri = (string: string): string => string.replace(/^data:.*,/, '');

/**
 * Convert base64 string to UInt8Array.
 * @note Function will remove "data-uri" attribute if present.
 */
export const base64ToArray = (base64: string): Uint8Array => Decoder.fromBase64(stripDataUri(base64)).asBytes;

/**
 * Convert ArrayBuffer or UInt8Array to base64 string
 */
export const arrayToBase64 = (array: ArrayBuffer | Uint8Array): string =>
  Encoder.toBase64(new Uint8Array(array)).asString;

/**
 * Returns base64 encoded md5 of the the given array.
 */
export const arrayToMd5Base64 = (array: Uint8Array): string => {
  const wordArray = CryptoJS.lib.WordArray.create(array);
  return CryptoJS.MD5(wordArray).toString(CryptoJS.enc.Base64);
};

/**
 * Convert base64 dataURI to Blob
 */

export const base64ToBlob = (base64: string): Blob => {
  const mimeType = getContentTypeFromDataUrl(base64);
  const bytes = base64ToArray(base64);
  return new Blob([bytes], {type: mimeType});
};

/**
 * Downloads blob using a hidden link element.ƒ
 */

export const downloadBlob = (blob: Blob, filename: string, mimeType?: string): number => {
  if (blob) {
    const url = window.URL.createObjectURL(blob);
    return downloadFile(url, filename, mimeType);
  }

  throw new Error('Failed to download blob: Resource not provided');
};

export const downloadFile = (url: string, fileName: string, mimeType?: string): number => {
  const anchor = document.createElement('a');
  anchor.download = fileName;
  anchor.href = url;
  anchor.style.display = 'none';
  if (mimeType) {
    anchor.type = mimeType;
  }

  // Firefox needs the element to be in the DOM for the download to start:
  // @see https://stackoverflow.com/a/32226068
  document.body.appendChild(anchor);
  anchor.click();

  // Wait before removing resource and link. Needed in FF.
  return window.setTimeout(() => {
    const objectURL = anchor.href;
    document.body.removeChild(anchor);
    window.URL.revokeObjectURL(objectURL);
  }, 100);
};

export const phoneNumberToE164 = (phoneNumber: string, countryCode: string): string => {
  return formatE164(`${countryCode}`.toUpperCase(), `${phoneNumber}`);
};

export const createRandomUuid = (): string => UUID.genV4().hexString;

export const encodeSha256Base64 = (text: string | CryptoJS.LibWordArray): string =>
  CryptoJS.SHA256(text).toString(CryptoJS.enc.Base64);

// Note IE10 listens to "transitionend" instead of "animationend"
export const alias = {
  animationend: 'transitionend animationend oAnimationEnd MSAnimationEnd mozAnimationEnd webkitAnimationEnd',
};

export const koArrayPushAll = (koArray: ObservableArray, valuesToPush: any[]) => {
  // append array to knockout observableArray
  // https://github.com/knockout/knockout/issues/416
  const underlyingArray = koArray();
  koArray.valueWillMutate();
  ko.utils.arrayPushAll(underlyingArray, valuesToPush);
  koArray.valueHasMutated();
};

export const koArrayUnshiftAll = (koArray: ObservableArray, valuesToShift: any[]) => {
  // prepend array to knockout observableArray
  const underlyingArray = koArray();
  koArray.valueWillMutate();
  Array.prototype.unshift.apply(underlyingArray, valuesToShift);
  koArray.valueHasMutated();
};

export const koPushDeferred = (target: ObservableArray, src: any[], number = 100, delay = 300) => {
  // push array deferred to knockout observableArray
  let interval: number;

  return (interval = window.setInterval(() => {
    const chunk = src.splice(0, number);
    koArrayPushAll(target, chunk);

    if (src.length === 0) {
      return window.clearInterval(interval);
    }
  }, delay));
};

/**
 * Add zero padding until limit is reached.
 */
export const zeroPadding = (value: string | number, length = 2): string => {
  const zerosNeeded = Math.max(0, length - value.toString().length);
  return `${'0'.repeat(zerosNeeded)}${value}`;
};

export const sortGroupsByLastEvent = (groupA: Conversation, groupB: Conversation): number =>
  groupB.last_event_timestamp() - groupA.last_event_timestamp();

export const sortObjectByKeys = (object: Record<string, any>, reverse: boolean) => {
  const keys = Object.keys(object);
  keys.sort();

  if (reverse) {
    keys.reverse();
  }

  // Returns a copy of an object, which is ordered by the keys of the original object.
  return keys.reduce((sortedObject: Record<string, any>, key: string) => {
    sortedObject[key] = object[key];
    return sortedObject;
  }, {});
};

// Removes url(' and url(" from the beginning of the string and also ") and ') from the end
export const stripUrlWrapper = (url: string) => url.replace(/^url\(["']?/, '').replace(/["']?\)$/, '');

export const validateProfileImageResolution = (file: any, minWidth: number, minHeight: number): Promise<boolean> => {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image.width >= minWidth && image.height >= minHeight);
    image.onerror = () => reject(new Error('Failed to load profile picture for size validation'));
    image.src = window.URL.createObjectURL(file);
  });
};

export const murmurhash3 = (key: string, seed: number): number => {
  const remainder = key.length & 3; // key.length % 4
  const bytes = key.length - remainder;
  let h1 = seed;
  const c1 = 0xcc9e2d51;
  const c2 = 0x1b873593;
  let index = 0;

  while (index < bytes) {
    let k1 =
      (key.charCodeAt(index) & 0xff) |
      ((key.charCodeAt(++index) & 0xff) << 8) |
      ((key.charCodeAt(++index) & 0xff) << 16) |
      ((key.charCodeAt(++index) & 0xff) << 24);
    ++index;

    k1 = ((k1 & 0xffff) * c1 + ((((k1 >>> 16) * c1) & 0xffff) << 16)) & 0xffffffff;
    k1 = (k1 << 15) | (k1 >>> 17);
    k1 = ((k1 & 0xffff) * c2 + ((((k1 >>> 16) * c2) & 0xffff) << 16)) & 0xffffffff;

    h1 ^= k1;
    h1 = (h1 << 13) | (h1 >>> 19);
    const h1b = ((h1 & 0xffff) * 5 + ((((h1 >>> 16) * 5) & 0xffff) << 16)) & 0xffffffff;
    h1 = (h1b & 0xffff) + 0x6b64 + ((((h1b >>> 16) + 0xe654) & 0xffff) << 16);
  }

  let k1 = 0;

  switch (remainder) {
    case 3:
      k1 ^= (key.charCodeAt(index + 2) & 0xff) << 16;
      break;
    case 2:
      k1 ^= (key.charCodeAt(index + 1) & 0xff) << 8;
      break;
    case 1:
      k1 ^= key.charCodeAt(index) & 0xff;

      k1 = ((k1 & 0xffff) * c1 + ((((k1 >>> 16) * c1) & 0xffff) << 16)) & 0xffffffff;
      k1 = (k1 << 15) | (k1 >>> 17);
      k1 = ((k1 & 0xffff) * c2 + ((((k1 >>> 16) * c2) & 0xffff) << 16)) & 0xffffffff;
      h1 ^= k1;
      break;
    default:
      break;
  }

  h1 ^= key.length;

  h1 ^= h1 >>> 16;
  h1 = ((h1 & 0xffff) * 0x85ebca6b + ((((h1 >>> 16) * 0x85ebca6b) & 0xffff) << 16)) & 0xffffffff;
  h1 ^= h1 >>> 13;
  h1 = ((h1 & 0xffff) * 0xc2b2ae35 + ((((h1 >>> 16) * 0xc2b2ae35) & 0xffff) << 16)) & 0xffffffff;
  h1 ^= h1 >>> 16;

  return h1 >>> 0;
};

export const printDevicesId = (id: string): string => {
  if (!id) {
    return '';
  }

  const idWithPadding = zeroPadding(id, 16);
  const parts = idWithPadding.match(/.{1,2}/g) || [];
  const prettifiedId = parts.map(part => `<span class='device-id-part'>${part}</span>`);

  return prettifiedId.join('');
};

// https://developer.mozilla.org/en-US/Firefox/Performance_best_practices_for_Firefox_fe_engineers
export const afterRender = (callback: TimerHandler): number =>
  window.requestAnimationFrame(() => window.setTimeout(callback, 0));

/**
 * No operation
 * @returns {void}
 */
export const noop = (): void => {};