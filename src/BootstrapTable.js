import React, {PropTypes} from 'react';
import classSet from 'classnames';
import Const from './Const';
import TableHeader from './TableHeader';
import TableBody from './TableBody';
import PaginationList from './pagination/PaginationList';
import ToolBar from './toolbar/ToolBar';
import TableFilter from './TableFilter';
import {TableDataStore} from './store/TableDataStore';
import Util from './util';
import exportCSV from './csv_export_util';
import {Filter} from './Filter';

class BootstrapTable extends React.Component {
    constructor(props) {
        super(props);
        this.isIE = false;
        this._attachCellEditFunc();
        if (document) {
            this.isIE = document.documentMode;
        }
        if (!Array.isArray(this.props.data)) {
            this.store = new TableDataStore(this.props.data.getData());
            this.props.data.clear();
            this.props.data.on('change', (data) => {
                this.store.setData(data);
                this.setState({
                    data: this.getTableData()
                })
            });
        } else {
            let copy   = this.props.data.slice();
            this.store = new TableDataStore(copy);
        }

        this.initTable(this.props);

        if (this.filter) {
            const self = this;
            this.filter.on('onFilterChange', (currentFilter) => {
                self.handleFilterData(currentFilter);
            });
        }

        if (this.props.selectRow && this.props.selectRow.selected) {
            let copy = this.props.selectRow.selected.slice();
            this.store.setSelectedRowKey(copy);
        }

        this.state = {
            data           : this.getTableData(),
            currPage       : this.props.options.page || 1,
            sizePerPage    : this.props.options.sizePerPage || Const.SIZE_PER_PAGE_LIST[ 0 ],
            selectedRowKeys: this.store.getSelectedRowKeys()
        };
    };

    initTable(props) {
        let { keyField } = props;

        const isKeyFieldDefined = typeof keyField === 'string' && keyField.length;
        React.Children.forEach(props.children, column=> {
            if (column.props.isKey) {
                if (keyField) {
                    throw "Error. Multiple key column be detected in TableHeaderColumn.";
                }
                keyField = column.props.dataField;
            }
            if (column.props.filter) {
                // a column contains a filter
                if (!this.filter) {
                    // first time create the filter on the BootstrapTable
                    this.filter = new Filter();
                }
                // pass the filter to column with filter
                column.props.filter.emitter = this.filter;
            }
        }, this);

        let colInfos = this.getColumnsDescription(props).reduce((prev, curr) => {
            prev[ curr.name ] = curr;
            return prev;
        }, {});

        if (!isKeyFieldDefined && !keyField)
            throw `Error. No any key column defined in TableHeaderColumn.
            Use 'isKey={true}' to specify a unique column after version 0.5.4.`;

        this.store.setProps({
            isPagination     : props.pagination,
            keyField         : keyField,
            colInfos         : colInfos,
            multiColumnSearch: props.multiColumnSearch,
            remote           : this.isRemoteDataSource()
        });
    };

    getTableData() {
        let result = [];

        if (this.props.options.sortName && this.props.options.sortOrder)
            this.store.sort(this.props.options.sortOrder, this.props.options.sortName);

        if (this.props.pagination) {
            let page, sizePerPage;
            if (this.store.isChangedPage()) {
                sizePerPage = this.state.sizePerPage;
                page        = this.state.currPage;
            } else {
                sizePerPage = this.props.options.sizePerPage || Const.SIZE_PER_PAGE_LIST[ 0 ];
                page        = this.props.options.page || 1;
            }
            result = this.store.page(page, sizePerPage).get();
        } else {
            result = this.store.get();
        }
        return result;
    };

    getColumnsDescription({ children }) {
        return React.Children.map(children, (column, i) => {
            return {
                name           : column.props.dataField,
                align          : column.props.dataAlign,
                sort           : column.props.dataSort,
                format         : column.props.dataFormat,
                formatExtraData: column.props.formatExtraData,
                filterFormatted: column.props.filterFormatted,
                editable       : column.props.editable,
                hidden         : column.props.hidden,
                searchable     : column.props.searchable,
                className      : column.props.columnClassName,
                width          : column.props.width,
                text           : column.props.children,
                sortFunc       : column.props.sortFunc,
                index          : i
            };
        });
    };

    componentWillReceiveProps(nextProps) {
        this.initTable(nextProps);
        if (Array.isArray(nextProps.data)) {
            this.store.setData(nextProps.data.slice());
            let page        = nextProps.options.page || this.state.currPage;
            let sizePerPage = nextProps.options.sizePerPage || this.state.sizePerPage;

            // #125
            if (!nextProps.options.page &&
                page >= Math.ceil(nextProps.data.length / sizePerPage)) {
                page = 1;
            }
            let sortInfo  = this.store.getSortInfo();
            let sortField = nextProps.options.sortName || (sortInfo ? sortInfo.sortField : undefined);
            let sortOrder = nextProps.options.sortOrder || (sortInfo ? sortInfo.order : undefined);
            if (sortField && sortOrder) this.store.sort(sortOrder, sortField);
            let data = this.store.page(page, sizePerPage).get();
            this.setState({
                data       : data,
                currPage   : page,
                sizePerPage: sizePerPage
            });
        }
        if (nextProps.selectRow && nextProps.selectRow.selected) {
            //set default select rows to store.
            let copy = nextProps.selectRow.selected.slice();
            this.store.setSelectedRowKey(copy);
            this.setState({
                selectedRowKeys: copy
            });
        }
    };

    componentDidMount() {
        this._adjustTable();
        window.addEventListener('resize', this._adjustTable);
        this.refs.body.refs.container.addEventListener('scroll', this._scrollHeader);
    };

    componentWillUnmount() {
        window.removeEventListener('resize', this._adjustTable);
        this.refs.body.refs.container.removeEventListener('scroll', this._scrollHeader);
        if (this.filter) {
            this.filter.removeAllListeners("onFilterChange");
        }
    };

    componentDidUpdate() {
        this._adjustTable();
        this._attachCellEditFunc();
        if (this.props.options.afterTableComplete)
            this.props.options.afterTableComplete();
    };

    _attachCellEditFunc() {
        if (this.props.cellEdit) {
            this.props.cellEdit.__onCompleteEdit__ = this.handleEditCell.bind(this);
            if (this.props.cellEdit.mode !== Const.CELL_EDIT_NONE)
                this.props.selectRow.clickToSelect = false;
        }
    };

    /**
     * Returns true if in the current configuration,
     * the datagrid should load its data remotely.
     *
     * @param  {Object}  [props] Optional. If not given, this.props will be used
     * @return {Boolean}
     */
    isRemoteDataSource(props) {
        return (props || this.props).remote;
    };

    render() {
        var childrens = this.props.children;
        var style     = {
            height   : this.props.height,
            maxHeight: this.props.maxHeight
        };
        if (!Array.isArray(this.props.children)) {
            childrens = [ this.props.children ];
        }
        var columns       = this.getColumnsDescription(this.props);
        var sortInfo      = this.store.getSortInfo();
        var pagination    = this.renderPagination();
        var toolBar       = this.renderToolBar();
        var tableFilter   = this.renderTableFilter(columns);
        var isSelectAll   = this.isSelectAll();
        let sortIndicator = this.props.options.sortIndicator;
        if (typeof this.props.options.sortIndicator === 'undefined') sortIndicator = true;
        return (
            <div className="react-bs-table-container">
                {toolBar}
                <div className="react-bs-table" ref="table" style={style}
                     onMouseEnter={this.handleMouseEnter.bind(this)}
                     onMouseLeave={this.handleMouseLeave.bind(this)}>
                    <TableHeader
                        ref="header"
                        rowSelectType={this.props.selectRow.mode}
                        hideSelectColumn={this.props.selectRow.hideSelectColumn}
                        sortName={sortInfo ? sortInfo.sortField : undefined}
                        sortOrder={sortInfo ? sortInfo.order : undefined}
                        sortIndicator={sortIndicator}
                        onSort={this.handleSort.bind(this)}
                        onSelectAllRow={this.handleSelectAllRow.bind(this)}
                        bordered={this.props.bordered}
                        condensed={this.props.condensed}
                        isFiltered={this.filter ? true : false}
                        isSelectAll={isSelectAll}>
                        {this.props.children}
                    </TableHeader>
                    <TableBody
                        ref="body"
                        style={style}
                        data={this.state.data}
                        columns={columns}
                        trClassName={this.props.trClassName}
                        striped={this.props.striped}
                        bordered={this.props.bordered}
                        hover={this.props.hover}
                        keyField={this.store.getKeyField()}
                        condensed={this.props.condensed}
                        selectRow={this.props.selectRow}
                        cellEdit={this.props.cellEdit}
                        selectedRowKeys={this.state.selectedRowKeys}
                        onRowClick={this.handleRowClick.bind(this)}
                        onRowMouseOver={this.handleRowMouseOver.bind(this)}
                        onRowMouseOut={this.handleRowMouseOut.bind(this)}
                        onSelectRow={this.handleSelectRow.bind(this)}
                        noDataText={this.props.options.noDataText}
                    />
                </div>
                {tableFilter}
                {pagination}
            </div>
        )
    };

    isSelectAll() {
        var defaultSelectRowKeys = this.store.getSelectedRowKeys();
        var allRowKeys           = this.store.getAllRowkey();
        if (defaultSelectRowKeys.length !== allRowKeys.length) {
            return defaultSelectRowKeys.length === 0 ? false : 'indeterminate';
        } else {
            return true;
        }
    };

    cleanSelected() {
        this.store.setSelectedRowKey([]);
        this.setState({
            selectedRowKeys: []
        });
    };

    handleSort(order, sortField) {
        if (this.props.options.onSortChange) {
            this.props.options.onSortChange(sortField, order, this.props);
        }

        let result = this.store.sort(order, sortField).get();
        this.setState({
            data: result
        });
    };

    handlePaginationData(page, sizePerPage) {
        const { onPageChange } = this.props.options;
        if (onPageChange) {
            onPageChange(page, sizePerPage);
        }

        if (this.isRemoteDataSource()) {
            return;
        }

        let result = this.store.page(page, sizePerPage).get();
        this.setState({
            data    : result,
            currPage: page,
            sizePerPage
        });
    };

    handleMouseLeave() {
        if (this.props.options.onMouseLeave) {
            this.props.options.onMouseLeave();
        }
    };

    handleMouseEnter() {
        if (this.props.options.onMouseEnter) {
            this.props.options.onMouseEnter();
        }
    };

    handleRowMouseOut(row) {
        if (this.props.options.onRowMouseOut) {
            this.props.options.onRowMouseOut(row);
        }
    };

    handleRowMouseOver(row) {
        if (this.props.options.onRowMouseOver) {
            this.props.options.onRowMouseOver(row);
        }
    };

    handleRowClick(row) {
        if (this.props.options.onRowClick) {
            this.props.options.onRowClick(row);
        }
    };

    handleSelectAllRow(e) {
        var isSelected      = e.currentTarget.checked;
        let selectedRowKeys = [];
        let result          = true;
        if (this.props.selectRow.onSelectAll) {
            result = this.props.selectRow.onSelectAll(isSelected,
                isSelected ? this.store.get() : []);
        }

        if (typeof result === 'undefined' || result !== false) {
            if (isSelected) {
                selectedRowKeys = this.store.getAllRowkey();
            }

            this.store.setSelectedRowKey(selectedRowKeys);
            this.setState({
                selectedRowKeys: selectedRowKeys
            });
        }
    };

    handleShowOnlySelected() {
        this.store.ignoreNonSelected();
        let result;
        if (this.props.pagination) {
            result = this.store.page(1, this.state.sizePerPage).get();
        } else {
            result = this.store.get();
        }
        this.setState({
            data    : result,
            currPage: 1,
        });
    };

    handleSelectRow(row, isSelected) {
        let currSelected = this.store.getSelectedRowKeys();
        let rowKey       = row[ this.store.getKeyField() ];
        let result       = true;
        if (this.props.selectRow.onSelect) {
            result = this.props.selectRow.onSelect(row, isSelected);
        }

        if (typeof result === 'undefined' || result !== false) {
            if (this.props.selectRow.mode === Const.ROW_SELECT_SINGLE) {
                currSelected = isSelected ? [ rowKey ] : []
            } else {
                if (isSelected) {
                    currSelected.push(rowKey);
                } else {
                    currSelected = currSelected.filter(function (key) {
                        return rowKey !== key;
                    });
                }
            }

            this.store.setSelectedRowKey(currSelected);
            this.setState({
                selectedRowKeys: currSelected
            });
        }
    };

    handleEditCell(newVal, rowIndex, colIndex) {
        let fieldName;
        React.Children.forEach(this.props.children, function (column, i) {
            if (i == colIndex) {
                fieldName = column.props.dataField;
                return false;
            }
        });

        let result = this.store.edit(newVal, rowIndex, fieldName).get();
        this.setState({
            data: result
        });

        if (this.props.cellEdit.afterSaveCell) {
            this.props.cellEdit.afterSaveCell(this.state.data[ rowIndex ], fieldName, newVal);
        }
    };

    handleAddRowBegin() {
        if (this.refs.body) {
            // this.refs.body.cancelEdit();
        }
    };

    handleAddRowAtBegin(newObj) {
        let result;
        try {
            this.store.addAtBegin(newObj);
        } catch (e) {
            return e;
        }
        this._handleAfterAddingRow(newObj);
    };

    handleAddRow(newObj) {
        let result;
        try {
            this.store.add(newObj);
        } catch (e) {
            return e;
        }
        this._handleAfterAddingRow(newObj);
    };

    getSizePerPage() {
        return this.state.sizePerPage;
    };

    getCurrentPage() {
        return this.state.currPage;
    };

    handleDropRow(rowKeys) {
        let that        = this;
        let dropRowKeys = rowKeys ? rowKeys : this.store.getSelectedRowKeys();
        //add confirm before the delete action if that option is set.
        if (dropRowKeys && dropRowKeys.length > 0) {
            if (this.props.options.handleConfirmDeleteRow) {
                this.props.options.handleConfirmDeleteRow(
                    function () {
                        that.deleteRow(dropRowKeys);
                    }
                );
            } else if (confirm('Are you sure want delete?')) {
                this.deleteRow(dropRowKeys);
            }
        }
    };

    deleteRow(dropRowKeys) {

        let result;
        this.store.remove(dropRowKeys);  //remove selected Row
        this.store.setSelectedRowKey([]);  //clear selected row key

        if (this.props.pagination) {
            const { sizePerPage } = this.state;
            let { currPage } = this.state;
            let currLastPage = Math.ceil(this.store.getDataNum() / sizePerPage);
            if (currPage > currLastPage)
                currPage = currLastPage;
            result = this.store.page(currPage, sizePerPage).get();
            this.setState({
                data           : result,
                selectedRowKeys: this.store.getSelectedRowKeys(),
                currPage
            });
        } else {
            result = this.store.get();
            this.setState({
                data           : result,
                selectedRowKeys: this.store.getSelectedRowKeys()
            });
        }
        if (this.props.options.afterDeleteRow) {
            this.props.options.afterDeleteRow(dropRowKeys);
        }
    };

    handleFilterData(filterObj) {
        this.store.filter(filterObj);
        let result;
        if (this.props.pagination) {
            const { sizePerPage } = this.state;
            result = this.store.page(1, sizePerPage).get();
        } else {
            result = this.store.get();
        }
        if (this.props.options.afterColumnFilter)
            this.props.options.afterColumnFilter(filterObj,
                this.store.getDataIgnoringPagination());
        this.setState({
            data    : result,
            currPage: 1
        });
    };

    handleExportCSV() {
        var result = this.store.getDataIgnoringPagination();
        var keys   = [];
        this.props.children.map(function (column) {
            if (column.props.hidden === false) {
                keys.push(column.props.dataField);
            }
        });
        exportCSV(result, keys, this.props.csvFileName);
    };

    handleSearch(searchText) {
        this.store.search(searchText);
        let result;
        if (this.props.pagination) {
            const { sizePerPage } = this.state;
            result = this.store.page(1, sizePerPage).get();
        } else {
            result = this.store.get();
        }
        if (this.props.options.afterSearch)
            this.props.options.afterSearch(searchText, this.store.getDataIgnoringPagination());
        this.setState({
            data    : result,
            currPage: 1
        });
    };

    renderPagination() {
        if (this.props.pagination) {
            let dataSize;
            if (this.isRemoteDataSource()) {
                dataSize = this.props.fetchInfo.dataTotalSize;
            } else {
                dataSize = this.store.getDataNum();
            }
            return (
                <div className="react-bs-table-pagination">
                    <PaginationList
                        ref="pagination"
                        currPage={ this.state.currPage }
                        changePage={this.handlePaginationData.bind(this)}
                        sizePerPage={ this.state.sizePerPage }
                        sizePerPageList={this.props.options.sizePerPageList || Const.SIZE_PER_PAGE_LIST}
                        paginationSize={this.props.options.paginationSize || Const.PAGINATION_SIZE}
                        remote={this.isRemoteDataSource()}
                        dataSize={dataSize}
                        onSizePerPageList={this.props.options.onSizePerPageList}
                        prePage={this.props.options.prePage || Const.PRE_PAGE}
                        nextPage={this.props.options.nextPage || Const.NEXT_PAGE}
                        firstPage={this.props.options.firstPage || Const.FIRST_PAGE}
                        lastPage={this.props.options.lastPage || Const.LAST_PAGE}
                    />
                </div>
            );
        }
        return null;
    };

    renderToolBar() {
        let enableShowOnlySelected = this.props.selectRow && this.props.selectRow.showOnlySelected;
        if (enableShowOnlySelected
            || this.props.insertRow
            || this.props.deleteRow
            || this.props.search
            || this.props.exportCSV
            || this.props.selectColumns) {
            let columns;
            if (Array.isArray(this.props.children)) {
                columns = this.props.children.map(function (column) {
                    var props = column.props;
                    return {
                        name     : props.children,
                        field    : props.dataField,
                        //when you want same auto generate value and not allow edit, example ID field
                        autoValue: props.autoValue || false,
                        //for create editor, no params for column.editable() indicate that editor for new row
                        editable : props.editable && (typeof props.editable === "function") ? props.editable() : props.editable,
                        format   : props.dataFormat ? function (value) {
                            return props.dataFormat(value, null, props.formatExtraData).replace(/<.*?>/g, '');
                        } : false
                    };
                });
            } else {
                columns = [ {
                    name    : this.props.children.props.children,
                    field   : this.props.children.props.dataField,
                    editable: this.props.children.props.editable
                } ];
            }

            return (
                <div className="react-bs-table-tool-bar">
                    <ToolBar
                        clearSearch={this.props.options.clearSearch}
                        enableInsert={this.props.insertRow}
                        enableDelete={this.props.deleteRow}
                        enableSearch={this.props.search}
                        enableExportCSV={this.props.exportCSV}
                        enableShowOnlySelected={enableShowOnlySelected}
                        enableSelectColumns={this.props.selectColumns}
                        columns={columns}
                        columnHeaders={this.getColumnsDescription(this.props)}
                        searchPlaceholder={this.props.searchPlaceholder}
                        onAddRow={this.handleAddRow.bind(this)}
                        onAddRowBegin={this.handleAddRowBegin.bind(this)}
                        onDropRow={this.handleDropRow.bind(this)}
                        onSearch={this.handleSearch.bind(this)}
                        onExportCSV={this.handleExportCSV.bind(this)}
                        onShowOnlySelected={this.handleShowOnlySelected.bind(this)}
                    />
                </div>
            )
        } else {
            return null;
        }
    };

    renderTableFilter(columns) {
        if (this.props.columnFilter) {
            return (
                <TableFilter columns={columns}
                             rowSelectType={this.props.selectRow.mode}
                             onFilter={this.handleFilterData.bind(this)}/>
            );
        } else {
            return null;
        }
    };

    _scrollHeader = (e) => {
        this.refs.header.refs.container.scrollLeft = e.currentTarget.scrollLeft;
    };

    _adjustTable = () => {
        this._adjustHeaderWidth();
        this._adjustHeight();
    };

    _adjustHeaderWidth = () => {
        const header          = this.refs.header.refs.header;
        const headerContainer = this.refs.header.refs.container;
        const tbody           = this.refs.body.refs.tbody;
        const firstRow        = tbody.childNodes[ 0 ];
        const isScroll        = headerContainer.offsetWidth !== tbody.parentNode.offsetWidth;
        const scrollBarWidth  = isScroll ? Util.getScrollBarWidth() : 0;
        if (firstRow && this.store.getDataNum()) {
            const cells = firstRow.childNodes;
            for (let i = 0; i < cells.length; i++) {
                const cell          = cells[ i ];
                const computedStyle = getComputedStyle(cell);
                let width           = parseFloat(computedStyle.width.replace("px", ""));
                if (this.isIE) {
                    const paddingLeftWidth  = parseFloat(computedStyle.paddingLeft.replace("px", ""));
                    const paddingRightWidth = parseFloat(computedStyle.paddingRight.replace("px", ""));
                    const borderRightWidth  = parseFloat(computedStyle.borderRightWidth.replace("px", ""));
                    const borderLeftWidth   = parseFloat(computedStyle.borderLeftWidth.replace("px", ""));
                    width                   = width + paddingLeftWidth + paddingRightWidth + borderRightWidth + borderLeftWidth;
                }
                const lastPadding = (cells.length - 1 == i ? scrollBarWidth : 0);
                if (width <= 0) {
                    width      = 120;
                    cell.width = width + lastPadding + "px";
                }
                const result                          = width + lastPadding + "px";
                header.childNodes[ i ].style.width    = result;
                header.childNodes[ i ].style.minWidth = result;
            }
        }
    };

    _adjustHeight = () => {
        if (this.props.height.indexOf('%') === -1) {
            this.refs.body.refs.container.style.height =
                parseFloat(this.props.height) - this.refs.header.refs.container.offsetHeight + "px";
        }
    };

    _handleAfterAddingRow(newObj) {
        let result;
        if (this.props.pagination) {
            //if pagination is enabled and insert row be trigger, change to last page
            const { sizePerPage } = this.state;
            const currLastPage = Math.ceil(this.store.getDataNum() / sizePerPage);
            result             = this.store.page(currLastPage, sizePerPage).get();
            this.setState({
                data    : result,
                currPage: currLastPage
            });
        } else {
            result = this.store.get();
            this.setState({
                data: result
            });
        }

        if (this.props.options.afterInsertRow) {
            this.props.options.afterInsertRow(newObj);
        }
    }
}

BootstrapTable.propTypes = {
    keyField         : PropTypes.string,
    height           : PropTypes.string,
    maxHeight        : PropTypes.string,
    data             : PropTypes.oneOfType([ PropTypes.array, PropTypes.object ]),
    remote           : PropTypes.bool, // remote data, default is false
    striped          : PropTypes.bool,
    bordered         : PropTypes.bool,
    hover            : PropTypes.bool,
    condensed        : PropTypes.bool,
    pagination       : PropTypes.bool,
    searchPlaceholder: PropTypes.string,
    selectRow        : PropTypes.shape({
        mode                    : PropTypes.oneOf([
            Const.ROW_SELECT_NONE,
            Const.ROW_SELECT_SINGLE,
            Const.ROW_SELECT_MULTI
        ]),
        bgColor                 : PropTypes.string,
        selected                : PropTypes.array,
        onSelect                : PropTypes.func,
        onSelectAll             : PropTypes.func,
        clickToSelect           : PropTypes.bool,
        hideSelectColumn        : PropTypes.bool,
        clickToSelectAndEditCell: PropTypes.bool,
        showOnlySelected        : PropTypes.bool
    }),
    cellEdit         : PropTypes.shape({
        mode         : PropTypes.string,
        blurToSave   : PropTypes.bool,
        afterSaveCell: PropTypes.func
    }),
    insertRow        : PropTypes.bool,
    deleteRow        : PropTypes.bool,
    search           : PropTypes.bool,
    columnFilter     : PropTypes.bool,
    trClassName      : PropTypes.any,
    options          : PropTypes.shape({
        clearSearch           : PropTypes.bool,
        sortName              : PropTypes.string,
        sortOrder             : PropTypes.string,
        sortIndicator         : PropTypes.bool,
        afterTableComplete    : PropTypes.func,
        afterDeleteRow        : PropTypes.func,
        afterInsertRow        : PropTypes.func,
        afterSearch           : PropTypes.func,
        afterColumnFilter     : PropTypes.func,
        onRowClick            : PropTypes.func,
        page                  : PropTypes.number,
        sizePerPageList       : PropTypes.array,
        sizePerPage           : PropTypes.number,
        paginationSize        : PropTypes.number,
        onSortChange          : PropTypes.func,
        onPageChange          : PropTypes.func,
        onSizePerPageList     : PropTypes.func,
        noDataText            : PropTypes.string,
        handleConfirmDeleteRow: PropTypes.func,
        prePage               : PropTypes.string,
        nextPage              : PropTypes.string,
        firstPage             : PropTypes.string,
        lastPage              : PropTypes.string
    }),
    fetchInfo        : PropTypes.shape({
        dataTotalSize: PropTypes.number
    }),
    exportCSV        : PropTypes.bool,
    selectColumns    : PropTypes.bool,
    csvFileName      : PropTypes.string
};

BootstrapTable.defaultProps = {
    height           : "100%",
    maxHeight        : undefined,
    striped          : false,
    bordered         : true,
    hover            : false,
    condensed        : false,
    pagination       : false,
    searchPlaceholder: undefined,
    selectRow        : {
        mode                    : Const.ROW_SELECT_NONE,
        bgColor                 : Const.ROW_SELECT_BG_COLOR,
        selected                : [],
        onSelect                : undefined,
        onSelectAll             : undefined,
        clickToSelect           : false,
        hideSelectColumn        : false,
        clickToSelectAndEditCell: false,
        showOnlySelected        : false
    },
    cellEdit         : {
        mode         : Const.CELL_EDIT_NONE,
        blurToSave   : false,
        afterSaveCell: undefined
    },
    insertRow        : false,
    deleteRow        : false,
    search           : false,
    multiColumnSearch: false,
    columnFilter     : false,
    trClassName      : '',
    options          : {
        clearSearch           : false,
        sortName              : undefined,
        sortOrder             : undefined,
        sortIndicator         : true,
        afterTableComplete    : undefined,
        afterDeleteRow        : undefined,
        afterInsertRow        : undefined,
        afterSearch           : undefined,
        afterColumnFilter     : undefined,
        onRowClick            : undefined,
        onMouseLeave          : undefined,
        onMouseEnter          : undefined,
        onRowMouseOut         : undefined,
        onRowMouseOver        : undefined,
        page                  : undefined,
        sizePerPageList       : Const.SIZE_PER_PAGE_LIST,
        sizePerPage           : undefined,
        paginationSize        : Const.PAGINATION_SIZE,
        onSizePerPageList     : undefined,
        noDataText            : undefined,
        handleConfirmDeleteRow: undefined,
        prePage               : Const.PRE_PAGE,
        nextPage              : Const.NEXT_PAGE,
        firstPage             : Const.FIRST_PAGE,
        lastPage              : Const.LAST_PAGE
    },
    fetchInfo        : {
        dataTotalSize: 0
    },
    exportCSV        : false,
    selectColumns    : true,
    csvFileName      : undefined
};

export default BootstrapTable;
