'use strict';
import React from 'react';
import {BootstrapTable, TableHeaderColumn} from 'react-bootstrap-table';


var products = [];

function addProducts(quantity) {
  var startId = products.length;
  for (var i = 0; i < quantity; i++) {
    var id = startId + i;
    products.push({
      id: id,
      name: "Item name 12345678" + id,
      price: 2100 + i
    });
  }
}

addProducts(5);

export default class LargeColumnTable extends React.Component{
  render(){
    return (
      <BootstrapTable data={products}>
          <TableHeaderColumn width="150" dataField="id" isKey={true}>ProductID</TableHeaderColumn>
          <TableHeaderColumn width="150" dataField="name">ProductName</TableHeaderColumn>
          <TableHeaderColumn width="150" dataField="price">ProductPrice</TableHeaderColumn>
          <TableHeaderColumn width="150" dataField="name">ProductName</TableHeaderColumn>
          <TableHeaderColumn width="150" dataField="price">ProductPrice</TableHeaderColumn>
          <TableHeaderColumn width="150" dataField="name">ProductName</TableHeaderColumn>
          <TableHeaderColumn width="150" dataField="price">ProductPrice</TableHeaderColumn>
          <TableHeaderColumn width="150" dataField="name">ProductName</TableHeaderColumn>
          <TableHeaderColumn width="150" dataField="price">ProductPrice</TableHeaderColumn>
          <TableHeaderColumn width="150" dataField="name">ProductName</TableHeaderColumn>
          <TableHeaderColumn width="150" dataField="price">ProductPrice</TableHeaderColumn>
          <TableHeaderColumn width="150" dataField="name">ProductName</TableHeaderColumn>
      </BootstrapTable>
    );
  }
};
