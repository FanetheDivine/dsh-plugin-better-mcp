/**
 * 客户端共享控件与主题样式。
 * 导出 ClientStyles、Button、Switch、Modal，保持与宿主管理页一致的视觉和键盘语义。
 */

import {
  type ButtonHTMLAttributes,
  type ReactNode,
  type RefObject,
  useEffect,
  useRef,
} from 'react';
import { createPortal } from 'react-dom';

/** 可参与弹层焦点循环的控件。 */
const FOCUSABLE =
  'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], [tabindex="0"]';

/** 每个文档的弹层堆栈，保证 Escape 与 Tab 只作用于最上层。 */
const MODAL_LAYERS = new WeakMap<Document, { element: HTMLElement; close: () => void }[]>();

/** 管理弹层焦点、Escape、Tab 与关闭后的焦点返回。 */
function useModalLayer(
  dialog: RefObject<HTMLDivElement | null>,
  open: boolean,
  onClose: () => void,
): void {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const element = dialog.current;
    if (!open || element === null) return undefined;
    const document = element.ownerDocument;
    const previous = document.activeElement;
    const stack = MODAL_LAYERS.get(document) ?? [];
    MODAL_LAYERS.set(document, stack);
    const layer = { element, close: () => close.current() };
    stack.push(layer);
    const initial =
      element.querySelector<HTMLElement>('[data-modal-autofocus]') ??
      element.querySelector<HTMLElement>(FOCUSABLE) ??
      element;
    if (!element.contains(document.activeElement)) initial.focus({ preventScroll: true });

    /** 处理最上层弹层的键盘操作。 */
    const onKeyDown = (event: KeyboardEvent): void => {
      if (
        stack.at(-1) !== layer ||
        event.defaultPrevented ||
        event.isComposing ||
        event.ctrlKey ||
        event.altKey ||
        event.metaKey
      ) {
        return;
      }
      if (event.key === 'Escape' && !event.shiftKey) {
        event.preventDefault();
        if (!event.repeat) close.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = [...element.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (item) => !item.closest('[inert], [hidden]'),
      );
      const first = items[0] ?? element;
      const last = items.at(-1) ?? element;
      const atEdge = event.shiftKey
        ? document.activeElement === first
        : document.activeElement === last;
      if (
        document.activeElement === element ||
        !element.contains(document.activeElement) ||
        atEdge
      ) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      const wasTop = stack.at(-1) === layer;
      stack.splice(stack.indexOf(layer), 1);
      document.removeEventListener('keydown', onKeyDown);
      if (stack.length === 0) MODAL_LAYERS.delete(document);
      if (!wasTop) return;
      const target =
        previous instanceof HTMLElement && previous.isConnected ? previous : stack.at(-1)?.element;
      target?.focus({ preventScroll: true });
    };
  }, [dialog, open]);
}

/** 按钮属性。 */
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** 视觉层级。 */
  variant?: 'primary' | 'outline' | 'danger' | 'ghost';
  /** 控件尺寸。 */
  size?: 'sm' | 'md' | 'lg';
  /** 是否正在执行操作。 */
  busy?: boolean;
}

/** 宿主风格按钮。 */
export function Button({
  variant = 'outline',
  size = 'sm',
  busy = false,
  disabled,
  className,
  type = 'button',
  ...props
}: ButtonProps): JSX.Element {
  const classes = [
    'better-mcp-button',
    `better-mcp-button-${variant}`,
    `better-mcp-button-${size}`,
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button
      {...props}
      type={type}
      className={classes}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
    />
  );
}

/** 开关属性。 */
export interface SwitchProps {
  /** 当前状态。 */
  checked: boolean;
  /** 状态切换回调。 */
  onChange: (checked: boolean) => void;
  /** 可访问名称。 */
  label: string;
  /** 是否禁用。 */
  disabled?: boolean;
  /** 悬浮说明。 */
  title?: string;
}

/** 宿主风格开关。 */
export function Switch({ checked, onChange, label, disabled, title }: SwitchProps): JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={title}
      disabled={disabled}
      className="better-mcp-switch"
      onClick={() => onChange(!checked)}
    >
      <span className="better-mcp-switch-thumb" aria-hidden="true" />
    </button>
  );
}

/** 弹层属性。 */
export interface ModalProps {
  /** 是否显示。 */
  open: boolean;
  /** 关闭回调。 */
  onClose: () => void;
  /** 标题与可访问名称。 */
  title: string;
  /** 关闭按钮名称。 */
  closeLabel: string;
  /** 标题栏操作。 */
  actions?: ReactNode;
  /** 补充说明。 */
  description?: string | undefined;
  /** 固定底部操作。 */
  footer?: ReactNode;
  /** 弹层附加类名。 */
  className?: string;
  /** 正文附加类名。 */
  bodyClassName?: string;
  /** 弹层测试选择器。 */
  testId?: string;
  /** 弹层内容。 */
  children?: ReactNode;
}

/** 带焦点管理与主题材质的宿主风格弹层。 */
export function Modal({
  open,
  onClose,
  title,
  closeLabel,
  actions,
  description,
  footer,
  className,
  bodyClassName,
  testId = 'better-mcp-modal',
  children,
}: ModalProps): JSX.Element | null {
  const dialog = useRef<HTMLDivElement>(null);
  useModalLayer(dialog, open, onClose);
  if (!open) return null;
  const dialogClasses = ['better-mcp-dialog', className].filter(Boolean).join(' ');
  const bodyClasses = ['better-mcp-dialog-body', bodyClassName].filter(Boolean).join(' ');
  return createPortal(
    <div className="better-mcp-modal-root" role="presentation">
      <div className="better-mcp-modal-mask" aria-hidden="true" onClick={onClose} />
      <div
        ref={dialog}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={dialogClasses}
        data-testid={testId}
      >
        <div className="better-mcp-dialog-content">
          <div className="better-mcp-dialog-header">
            <h2 className="better-mcp-dialog-title">{title}</h2>
            {actions !== undefined ? (
              <div className="better-mcp-dialog-actions">{actions}</div>
            ) : null}
            <Button
              variant="ghost"
              className="better-mcp-dialog-close"
              aria-label={closeLabel}
              onClick={onClose}
            >
              <span aria-hidden="true">×</span>
            </Button>
          </div>
          {description !== undefined && description !== '' ? (
            <p className="better-mcp-dialog-description">{description}</p>
          ) : null}
          <div className={bodyClasses}>{children}</div>
        </div>
        {footer !== undefined ? <div className="better-mcp-dialog-footer">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}

/** 在组件树中挂载本插件的局部样式。 */
export function ClientStyles(): JSX.Element {
  return <style data-better-mcp-styles="">{CLIENT_STYLES}</style>;
}

/** 面板、表单与共享控件的主题化样式。 */
export const CLIENT_STYLES = String.raw`
.better-mcp-page,
.better-mcp-dialog {
  box-sizing: border-box;
  color: var(--dsw-alias-label-primary);
  font-size: 13px;
  line-height: 20px;
}
.better-mcp-page *,
.better-mcp-dialog * {
  box-sizing: border-box;
}
.better-mcp-sidebar-action {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  border: 0;
  border-radius: var(--dsw-radius-md);
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
  font-size: 12px;
  line-height: 18px;
  text-align: left;
}
.better-mcp-sidebar-action[data-wide='true'] {
  justify-content: flex-start;
  padding: 6px 8px;
}
.better-mcp-sidebar-action[data-wide='false'] {
  justify-content: center;
  padding: 6px;
}
.better-mcp-summary {
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  line-height: 18px;
}
.better-mcp-button {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin: 0;
  border: 0;
  border-radius: var(--dsw-radius-sm);
  background: transparent;
  color: var(--dsw-alias-label-primary);
  cursor: pointer;
  font-family: inherit;
  font-weight: 400;
  white-space: nowrap;
}
.better-mcp-button-sm {
  min-height: 28px;
  padding: 0 10px;
  font-size: 12px;
  line-height: 18px;
}
.better-mcp-button-md {
  min-height: 32px;
  padding: 0 12px;
  border-radius: var(--dsw-radius-md);
  font-size: 13px;
  line-height: 20px;
}
.better-mcp-button-lg {
  min-height: 36px;
  padding: 0 14px;
  border-radius: var(--dsw-radius-md);
  font-size: 14px;
  line-height: 22px;
}
.better-mcp-button-outline {
  box-shadow: inset 0 0 0 var(--dsh-hairline-width) var(--dsw-alias-border-l3);
}
.better-mcp-button-primary {
  background: var(--dsw-alias-button-primary-fill);
  color: var(--dsw-alias-label-primary-foreground);
}
.better-mcp-button-danger {
  color: var(--dsw-alias-state-error-primary);
  box-shadow: inset 0 0 0 var(--dsh-hairline-width) color-mix(in srgb, var(--dsw-alias-state-error-primary) 30%, transparent);
}
.better-mcp-button:disabled {
  cursor: default;
  opacity: 0.4;
}
.better-mcp-button:focus-visible,
.better-mcp-sidebar-action:focus-visible {
  outline: var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: 2px;
}
@media (hover: hover) {
  .better-mcp-button-outline:not(:disabled):hover,
  .better-mcp-button-ghost:not(:disabled):hover,
  .better-mcp-sidebar-action:hover {
    background: var(--dsw-alias-interactive-bg-hover);
  }
  .better-mcp-button-primary:not(:disabled):hover {
    background: var(--dsw-alias-button-primary-hover);
  }
  .better-mcp-button-danger:not(:disabled):hover {
    background: var(--dsw-alias-interactive-bg-hover-danger);
  }
}
.better-mcp-switch {
  position: relative;
  flex: 0 0 auto;
  width: 36px;
  height: 20px;
  margin: 0;
  padding: 2px;
  border: 0;
  border-radius: 999px;
  background: var(--dsw-alias-border-l3);
  cursor: pointer;
}
.better-mcp-switch[aria-checked='true'] {
  background: var(--dsw-alias-brand-primary);
}
.better-mcp-switch:disabled {
  cursor: default;
  opacity: 0.5;
}
.better-mcp-switch:focus-visible {
  outline: var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: 2px;
}
.better-mcp-switch-thumb {
  display: block;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--dsw-alias-label-primary-foreground);
  transition: transform 120ms ease;
}
.better-mcp-switch[aria-checked='false'] .better-mcp-switch-thumb {
  background: var(--dsw-alias-switch-thumb);
}
.better-mcp-switch[aria-checked='true'] .better-mcp-switch-thumb {
  transform: translateX(16px);
}
.better-mcp-modal-root {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: max(24px, var(--dsh-frame-overlay-top, 24px)) 24px;
}
.better-mcp-modal-mask {
  position: absolute;
  inset: var(--dsh-frame-chrome-top, 0px) 0 0;
  backdrop-filter: var(--dsw-mask-blur);
}
.better-mcp-modal-mask::after {
  content: '';
  position: absolute;
  inset: 0;
  background: var(--dsw-alias-bg-mask-1);
}
.better-mcp-dialog {
  position: relative;
  display: flex;
  flex-direction: column;
  width: min(760px, 100%);
  max-height: 100%;
  overflow: hidden;
  border-radius: var(--dsw-radius-panel);
  background: var(--dsw-alias-bg-layer-2);
  box-shadow: var(--dsw-elevation-prominent);
}
.better-mcp-dialog-form {
  width: min(640px, 100%);
}
.better-mcp-dialog-confirm {
  width: min(420px, 100%);
}
.better-mcp-dialog:focus {
  outline: none;
}
.better-mcp-dialog-content {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
}
.better-mcp-dialog-header {
  display: flex;
  flex: none;
  align-items: center;
  gap: 8px;
  padding: 20px 16px 12px 24px;
}
.better-mcp-dialog-title {
  min-width: 0;
  margin: 0;
  color: var(--dsw-alias-label-primary);
  font-size: 16px;
  line-height: 24px;
  font-weight: 500;
  overflow-wrap: anywhere;
}
.better-mcp-dialog-actions {
  display: flex;
  flex: none;
  align-items: center;
  gap: 8px;
  margin-inline-start: auto;
}
.better-mcp-dialog-close {
  width: 28px;
  height: 28px;
  min-height: 28px;
  padding: 0;
  color: var(--dsw-alias-label-secondary);
  font-size: 20px;
}
.better-mcp-dialog-description {
  margin: 0;
  padding: 0 24px 16px;
  color: var(--dsw-alias-label-secondary);
  font-size: 13px;
  line-height: 20px;
  overflow-wrap: anywhere;
}
.better-mcp-dialog-body {
  flex: 1;
  min-height: 0;
  padding: 0 24px 20px;
  overflow-y: auto;
  scrollbar-color: var(--dsw-alias-scrollbar-hover-l2) var(--dsw-alias-scrollbar-bg-l2);
}
.better-mcp-dialog-footer {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 16px 24px 20px;
  border-top: var(--dsh-hairline-width) solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-2);
}
.better-mcp-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}
.better-mcp-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex-wrap: wrap;
}
.better-mcp-section-title {
  flex: 1;
  min-width: 120px;
  margin: 0;
  color: var(--dsw-alias-label-primary);
  font-size: 14px;
  line-height: 20px;
  font-weight: 500;
}
.better-mcp-panel-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}
.better-mcp-server-list {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
}
.better-mcp-server {
  min-width: 0;
  padding: 16px 2px;
  border-bottom: var(--dsh-hairline-width) solid var(--dsw-alias-border-l2);
}
.better-mcp-server:first-child {
  padding-top: 4px;
}
.better-mcp-server:last-child {
  border-bottom: 0;
}
.better-mcp-server-line {
  display: flex;
  align-items: center;
  gap: 16px;
  min-width: 0;
}
.better-mcp-server-icon {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border: var(--dsh-hairline-width) solid var(--dsw-alias-border-l3);
  border-radius: var(--dsw-radius-md);
  color: var(--dsw-alias-label-secondary);
}
.better-mcp-server-main {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.better-mcp-server-title {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex-wrap: wrap;
}
.better-mcp-server-name {
  color: var(--dsw-alias-label-primary);
  font-size: 13.5px;
  line-height: 20px;
  font-weight: 500;
  overflow-wrap: anywhere;
}
.better-mcp-badge {
  display: inline-flex;
  align-items: center;
  min-height: 19px;
  padding: 0 8px;
  border-radius: 999px;
  background: var(--dsw-alias-bg-module-platform);
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
  line-height: 17px;
}
.better-mcp-server-side {
  display: flex;
  flex: none;
  align-items: center;
  gap: 16px;
}
.better-mcp-state {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--dsw-alias-label-secondary);
  font-size: 12.5px;
  line-height: 18px;
  white-space: nowrap;
}
.better-mcp-state[data-state='failed'] {
  color: var(--dsw-alias-state-error-primary);
}
.better-mcp-state-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--dsw-alias-state-idle-primary);
}
.better-mcp-state-dot[data-state='connected'] {
  background: var(--dsw-alias-state-success-primary);
}
.better-mcp-state-dot[data-state='connecting'],
.better-mcp-state-dot[data-state='reconnecting'] {
  background: var(--dsw-alias-state-business-primary);
}
.better-mcp-state-dot[data-state='waiting-credentials'] {
  background: var(--dsw-alias-state-warn-primary);
}
.better-mcp-state-dot[data-state='failed'] {
  background: var(--dsw-alias-state-error-primary);
}
.better-mcp-lazy {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  line-height: 18px;
  white-space: nowrap;
}
.better-mcp-description {
  margin: 0;
  color: var(--dsw-alias-label-secondary);
  font-size: 13px;
  line-height: 20px;
  overflow-wrap: anywhere;
}
.better-mcp-server-extra {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  margin: 10px 0 0 56px;
}
.better-mcp-server-meta,
.better-mcp-server-url {
  margin: 0;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 18px;
  overflow-wrap: anywhere;
}
.better-mcp-server-url {
  font-family: var(--dsw-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
}
.better-mcp-diagnostics {
  margin: 0;
  padding: 8px 10px;
  border-radius: var(--dsw-radius-sm);
  background: var(--dsw-alias-bg-module-platform);
  color: var(--dsw-alias-state-error-primary);
  font-size: 12px;
  line-height: 18px;
  overflow-wrap: anywhere;
}
.better-mcp-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.better-mcp-feedback {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 0;
  padding: 10px 12px;
  border-radius: var(--dsw-radius-md);
  background: var(--dsw-alias-bg-module-platform);
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  line-height: 18px;
  overflow-wrap: anywhere;
}
.better-mcp-feedback-error {
  color: var(--dsw-alias-state-error-primary);
}
.better-mcp-feedback span {
  flex: 1;
  min-width: 0;
}
.better-mcp-feedback a {
  color: var(--dsw-alias-state-business-primary);
  overflow-wrap: anywhere;
}
.better-mcp-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}
.better-mcp-form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px 16px;
}
.better-mcp-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.better-mcp-field-full {
  grid-column: 1 / -1;
}
.better-mcp-label {
  color: var(--dsw-alias-label-primary);
  font-size: 13px;
  line-height: 20px;
  font-weight: 500;
}
.better-mcp-input {
  width: 100%;
  min-width: 0;
  min-height: 34px;
  margin: 0;
  padding: 6px 12px;
  border: var(--dsh-hairline-width) solid var(--dsw-alias-border-l4);
  border-radius: var(--dsw-radius-md);
  outline: none;
  background: var(--dsw-alias-bg-layer-3);
  color: var(--dsw-alias-label-primary);
  font-family: inherit;
  font-size: 13px;
  line-height: 20px;
}
select.better-mcp-input {
  padding-top: 0;
  padding-bottom: 0;
}
.better-mcp-input::placeholder {
  color: var(--dsw-alias-label-dimmed);
  opacity: 1;
}
.better-mcp-input:focus {
  border-color: var(--dsw-alias-state-business-primary);
  box-shadow: inset 0 0 0 var(--dsh-hairline-width) var(--dsw-alias-state-business-primary);
}
.better-mcp-input[aria-invalid='true'] {
  border-color: var(--dsw-alias-state-error-primary);
}
.better-mcp-input:disabled {
  opacity: 0.55;
}
.better-mcp-textarea {
  min-height: 72px;
  resize: vertical;
}
.better-mcp-code {
  font-family: var(--dsw-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
}
.better-mcp-checkbox {
  display: inline-flex;
  align-items: center;
  align-self: flex-start;
  gap: 8px;
  color: var(--dsw-alias-label-primary);
  font-size: 13px;
  line-height: 20px;
}
.better-mcp-checkbox input {
  width: 16px;
  height: 16px;
  margin: 2px 0;
  accent-color: var(--dsw-alias-brand-primary);
}
.better-mcp-field-error,
.better-mcp-form-error {
  margin: 0;
  color: var(--dsw-alias-state-error-primary);
  font-size: 12px;
  line-height: 18px;
  overflow-wrap: anywhere;
}
.better-mcp-form-error {
  padding: 10px 12px;
  border-radius: var(--dsw-radius-md);
  background: var(--dsw-alias-bg-module-platform);
}
@media (max-width: 720px) {
  .better-mcp-modal-root {
    padding: 12px;
  }
  .better-mcp-dialog-header {
    flex-wrap: wrap;
    padding: 16px 12px 12px 16px;
  }
  .better-mcp-dialog-actions {
    order: 3;
    width: 100%;
    margin-inline-start: 0;
    flex-wrap: wrap;
  }
  .better-mcp-dialog-body {
    padding: 0 16px 16px;
  }
  .better-mcp-dialog-footer {
    padding: 12px 16px 16px;
  }
  .better-mcp-server-line {
    align-items: flex-start;
    flex-wrap: wrap;
    gap: 12px;
  }
  .better-mcp-server-main {
    min-width: calc(100% - 52px);
  }
  .better-mcp-server-side {
    width: 100%;
    justify-content: space-between;
    margin-left: 52px;
  }
  .better-mcp-server-extra {
    margin-left: 0;
  }
  .better-mcp-form-grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .better-mcp-field-full {
    grid-column: auto;
  }
}
@media (prefers-reduced-motion: reduce) {
  .better-mcp-switch-thumb {
    transition: none;
  }
}
`;
