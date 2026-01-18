// ===== Command Pattern for Undo/Redo =====

/**
 * 基礎 Command 類別
 */
export class Command {
    execute() { }
    undo() { }
}

/**
 * 新增遮罩指令
 */
export class AddMaskCommand extends Command {
    constructor(page, mask) {
        super();
        this.page = page;
        this.mask = mask;
    }

    execute() {
        this.page.masks.push(this.mask);
    }

    undo() {
        const index = this.page.masks.indexOf(this.mask);
        if (index > -1) {
            this.page.masks.splice(index, 1);
        }
    }
}

/**
 * 刪除遮罩指令
 */
export class RemoveMaskCommand extends Command {
    constructor(page, mask) {
        super();
        this.page = page;
        this.mask = mask;
        this.maskIndex = page.masks.indexOf(mask);
    }

    execute() {
        const index = this.page.masks.indexOf(this.mask);
        if (index > -1) {
            this.page.masks.splice(index, 1);
        }
    }

    undo() {
        // 恢復到原本的位置
        this.page.masks.splice(this.maskIndex, 0, this.mask);
    }
}

/**
 * 清除所有遮罩指令
 */
export class ClearMasksCommand extends Command {
    constructor(page) {
        super();
        this.page = page;
        this.previousMasks = [...page.masks]; // 複製陣列
    }

    execute() {
        this.page.masks = [];
    }

    undo() {
        this.page.masks = [...this.previousMasks];
    }
}

/**
 * Command Manager - 管理 Undo/Redo 歷史
 */
export class CommandManager {
    constructor(maxHistory = 50) {
        this.history = [];
        this.currentIndex = -1;
        this.maxHistory = maxHistory;
    }

    /**
     * 執行指令並加入歷史
     */
    execute(command) {
        // 執行指令
        command.execute();

        // 移除當前位置之後的所有歷史
        this.history = this.history.slice(0, this.currentIndex + 1);

        // 加入新指令
        this.history.push(command);

        // 限制歷史記錄數量
        if (this.history.length > this.maxHistory) {
            this.history.shift();
        } else {
            this.currentIndex++;
        }
    }

    /**
     * 復原
     */
    undo() {
        if (!this.canUndo()) return false;

        const command = this.history[this.currentIndex];
        command.undo();
        this.currentIndex--;
        return true;
    }

    /**
     * 重做
     */
    redo() {
        if (!this.canRedo()) return false;

        this.currentIndex++;
        const command = this.history[this.currentIndex];
        command.execute();
        return true;
    }

    /**
     * 檢查是否可以復原
     */
    canUndo() {
        return this.currentIndex >= 0;
    }

    /**
     * 檢查是否可以重做
     */
    canRedo() {
        return this.currentIndex < this.history.length - 1;
    }

    /**
     * 清空歷史
     */
    clear() {
        this.history = [];
        this.currentIndex = -1;
    }

    /**
     * 取得歷史記錄數量
     */
    getHistoryLength() {
        return this.history.length;
    }
}
