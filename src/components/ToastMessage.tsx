import React from "react";
import { CheckCircle, XCircle, Info, AlertTriangle } from "lucide-react";

export type ToastType = "success" | "error" | "info" | "warning";

interface ToastMessageProps {
  id: string;
  message: string;
  type: ToastType;
  onClose: (id: string) => void;
}

const ToastMessage: React.FC<ToastMessageProps> = ({
  id,
  message,
  type,
  onClose,
}) => {
  const baseClasses =
    "relative p-4 pr-10 rounded-lg shadow-md flex items-center gap-3 text-sm";
  let typeClasses = "";
  let IconComponent: React.ElementType;

  switch (type) {
    case "success":
      typeClasses = "bg-green-500 text-white";
      IconComponent = CheckCircle;
      break;
    case "error":
      typeClasses = "bg-red-500 text-white";
      IconComponent = XCircle;
      break;
    case "info":
      typeClasses = "bg-blue-500 text-white";
      IconComponent = Info;
      break;
    case "warning":
      typeClasses = "bg-yellow-500 text-white";
      IconComponent = AlertTriangle;
      break;
    default:
      typeClasses = "bg-gray-700 text-white";
      IconComponent = Info;
  }

  return (
    <div
      className={`${baseClasses} ${typeClasses} pointer-events-auto cursor-pointer`} // cursor-pointer を追加
      onClick={() => onClose(id)} // クリックで閉じる機能を追加
    >
      <IconComponent size={20} className="flex-shrink-0" />
      <p className="flex-grow">{message}</p>
      {/* 閉じるボタンを削除 */}
    </div>
  );
};

export default ToastMessage;
