import React from "react";

interface ToastContainerProps {
  children: React.ReactNode;
}

const ToastContainer: React.FC<ToastContainerProps> = ({ children }) => {
  return (
    <div className="fixed bottom-4 right-4 z-50 w-full max-w-xs space-y-2 pointer-events-none">
      {children}
    </div>
  );
};

export default ToastContainer;
