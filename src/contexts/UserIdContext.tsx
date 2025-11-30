import React, {
  createContext,
  useState,
  useEffect,
  useContext,
  ReactNode,
} from "react";
import { v4 as uuidv4 } from "uuid";

const USER_ID_KEY = "app_user_id";

type UserIdContextType = string | null;

const UserIdContext = createContext<UserIdContextType>(null);

export const UserIdProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    let storedUserId = localStorage.getItem(USER_ID_KEY);
    if (!storedUserId) {
      storedUserId = uuidv4();
      localStorage.setItem(USER_ID_KEY, storedUserId);
    }
    setUserId(storedUserId);
  }, []);

  return (
    <UserIdContext.Provider value={userId}>{children}</UserIdContext.Provider>
  );
};

export const useUserId = (): UserIdContextType => {
  return useContext(UserIdContext);
};
