import React from 'react';
import '../../app.scss';

export const emptyRow = () => {
    //
    // Used to provide empty tables with an "this table is empty" type message
    return (
        <tr colSpan="10" className="emptyRow">
            <td colSpan="10" className="emptyCell">No Hosts Defined</td>
        </tr>
    );
};
