import React from 'react';
import '../app.scss';

export class ProgressTracker extends React.Component {
    constructor(props) {
        super(props);
        this.state = {};
        this.itemState = Array(6).fill("indicator");
    }

    render() {
        if (this.props.pageNum >= 1) {
            for (let i = 1; i < 6; i++) {
                if (i == this.props.pageNum) {
                    this.itemState[i] = "indicator selected selectable";
                } else {
                    let current = this.itemState[i];
                    current = current.replace('selected', '');
                    this.itemState[i] = current;
                }
            }
        }

        return (
            <div id="navcontainer">
                <span label-name="Environment" onClick={ () => this.props.pageSwitcher(1) } className={this.itemState[1]}>1</span>
                <span className="joiner">&nbsp;</span>
                <span label-name="Hosts" onClick={() => this.props.pageSwitcher(2)} className={this.itemState[2]}>2</span>
                <span className="joiner">&nbsp;</span>
                <span label-name="Validate" onClick={() => this.props.pageSwitcher(3)} className={this.itemState[3]}>3</span>
                <span className="joiner">&nbsp;</span>
                <span label-name="Network" onClick={() => this.props.pageSwitcher(4)} className={this.itemState[4]}>4</span>
                <span className="joiner">&nbsp;</span>
                <span label-name="Deploy" onClick={() => this.props.pageSwitcher(5)} className={this.itemState[5]}>5</span>
            </div>
        );
    }
}

export default ProgressTracker;
