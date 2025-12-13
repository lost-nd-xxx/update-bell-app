import React, {
  createContext,
  useState,
  useEffect,
  useContext,
  ReactNode,
  useCallback,
} from "react";
import { v4 as uuidv4 } from "uuid";
import {
  generateKeyPair,
  exportKey,
  importKey,
  signData,
  createSignatureMessage,
} from "../utils/crypto";

const USER_ID_KEY = "app_user_id";
const PUBLIC_KEY_KEY = "app_user_public_key";
const PRIVATE_KEY_KEY = "app_user_private_key";

interface UserIdContextType {
  userId: string | null;
  publicKey: JsonWebKey | null;
  isReady: boolean;
  getAuthHeaders: (body: string | object) => Promise<HeadersInit>;
}

const UserIdContext = createContext<UserIdContextType>({
  userId: null,
  publicKey: null,
  isReady: false,
  getAuthHeaders: async () => ({}),
});

export const UserIdProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [userId, setUserId] = useState<string | null>(null);
  const [publicKey, setPublicKey] = useState<JsonWebKey | null>(null);
  const [privateKey, setPrivateKey] = useState<CryptoKey | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const initializeUserAndKeys = async () => {
      try {
        // 1. UserIDの取得または生成
        let storedUserId = localStorage.getItem(USER_ID_KEY);
        if (!storedUserId) {
          storedUserId = uuidv4();
          localStorage.setItem(USER_ID_KEY, storedUserId);
        }
        setUserId(storedUserId);

        // 2. 鍵ペアの取得または生成
        const storedPublicKeyStr = localStorage.getItem(PUBLIC_KEY_KEY);
        const storedPrivateKeyStr = localStorage.getItem(PRIVATE_KEY_KEY);

        if (storedPublicKeyStr && storedPrivateKeyStr) {
          // 既存の鍵を読み込む
          const jwkPublic = JSON.parse(storedPublicKeyStr) as JsonWebKey;
          const jwkPrivate = JSON.parse(storedPrivateKeyStr) as JsonWebKey;

          // インポートしてCryptoKeyオブジェクトにする
          const importedPrivateKey = await importKey(jwkPrivate, "private");

          setPublicKey(jwkPublic);
          setPrivateKey(importedPrivateKey);
        } else {
          // 新しい鍵ペアを生成
          const keyPair = await generateKeyPair();

          // 保存用にエクスポート
          const jwkPublic = await exportKey(keyPair.publicKey);
          const jwkPrivate = await exportKey(keyPair.privateKey);

          localStorage.setItem(PUBLIC_KEY_KEY, JSON.stringify(jwkPublic));
          localStorage.setItem(PRIVATE_KEY_KEY, JSON.stringify(jwkPrivate));

          setPublicKey(jwkPublic);
          setPrivateKey(keyPair.privateKey);
        }
      } catch (error) {
        console.error("Failed to initialize user context:", error);
      } finally {
        setIsReady(true);
      }
    };

    initializeUserAndKeys();
  }, []);

  const getAuthHeaders = useCallback(
    async (body: string | object): Promise<HeadersInit> => {
      if (!privateKey || !publicKey || !userId) {
        console.warn("Auth headers requested but keys or userId are missing.");
        return {};
      }

      const timestamp = new Date().toISOString();
      const message = createSignatureMessage(body, timestamp);
      const signature = await signData(privateKey, message);

      return {
        "X-User-Id": userId,
        "X-Public-Key": JSON.stringify(publicKey),
        "X-Signature": signature,
        "X-Timestamp": timestamp,
      };
    },
    [privateKey, publicKey, userId],
  );

  return (
    <UserIdContext.Provider
      value={{ userId, publicKey, isReady, getAuthHeaders }}
    >
      {children}
    </UserIdContext.Provider>
  );
};

export const useUserId = (): UserIdContextType => {
  return useContext(UserIdContext);
};
