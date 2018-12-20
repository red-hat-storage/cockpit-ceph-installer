import React from 'react';
import '../../app.scss';

export const emptyRow = () => {
    return (
        <tbody>
            <tr className="emptyTable">
                <td colSpan="9" className="emptyTable">No Hosts Defined</td>
            </tr>
        </tbody>
    );
};
