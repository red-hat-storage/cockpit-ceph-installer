import React from 'react';
import '../../app.scss';

export class GenericModal extends React.Component {
    constructor(props) {
        super(props);
        this.state = {};
    }

    render() {
        let showHideClass = this.props.show ? 'modal display-block' : 'modal display-none';
        return (
            <div className={showHideClass}>
                <section className="modal-main">
                    <WindowTitle title={this.props.title} closeHandler={this.props.closeHandler} />
                    <div className="modal-inner">
                        { this.props.content }
                        <br />
                    </div>
                    <button className="modal-close btn btn-primary btn-lg"
                        onClick={this.props.closeHandler}>
                        Close
                    </button>
                </section>
            </div>
        );
    }
}

export class WindowTitle extends React.Component {
    render () {
        return (
            <div className="modal-title-bar">
                <div className="float-left modal-title">{this.props.title}</div>
                <div className="float-right close-symbol" onClick={() => { this.props.closeHandler() }} />
            </div>
        );
    }
}
